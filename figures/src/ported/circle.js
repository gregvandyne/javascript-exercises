// Oomba Figures: a circle figure's geometry and layout. The circle has radius 1 and its center at the origin in its own
// units (y up). From the caller's points (each placed by its direction from the center, and its distance in radii) and
// lines (a join between two places, a tangent at a point on the circle, a tangent from a point outside it), it works out
// where every line runs (an end can run on, through the circle and a little past it), what kind of line each is
// (radius, diameter, chord, secant, tangent), where lines cross, and the angle between two rays at a place. The layout
// draws it at a fixed radius on the page and puts every name, line label, arc label and angle label clear of the rest.
// Pure numbers in, pure numbers out: the reading, the checks and the drawing are figures/src/circle.js.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; lines are given by the names of the places they join (structured data),
// not by ids and keys kept in a page address; an end runs on through the circle by itself, or not at all (the original's
// "run until it meets that line" and midpoint places are left out); the enclosed areas the original finds and shades by
// clicking are replaced by the sectors and segments the caller names; names, line labels and arc labels are placed by a
// simpler search (out from the circle, or in the widest gap), and the label typesetting is Oomba's own (mathtext.js);
// what the original kept for pointing and clicking, and the label size setting (a scale factor instead), are left out.
import { lnAdd, lnSub, lnMul, lnDot, lnCross, lnLen, lnUnit, lnPerp, lnReach, lnTicks, lnHead, lnLabelSet, lnFrame, lnAngleMark } from './lines.js';

export const CIR_R = 130;          // the circle's radius on the page
const CIR_RUN = 0.45;              // how far a run-on end goes past the circle (or its point), in radii
const CIR_TANGENT = 0.9;           // how far a tangent at a point runs each way
const CIR_SAME = 1e-6;
const CIR_RAD = Math.PI / 180;

export const cirAt = deg => [Math.cos(deg * CIR_RAD), Math.sin(deg * CIR_RAD)];
export const cirDeg = u => ((Math.atan2(u[1], u[0]) / CIR_RAD) % 360 + 360) % 360;
export const cirOn = p => Math.abs(lnLen(p) - 1) < CIR_SAME;
/** Where a line through P along d meets the circle, as distances along it. */
export function cirMeets(P, d) {
  const b = lnDot(P, d), disc = b * b - (lnDot(P, P) - 1);
  if (disc < 1e-12) return [];
  const r = Math.sqrt(disc);
  return [-b - r, -b + r];
}
/** Where a tangent from P touches the circle, on its side looking from P toward the center, or null from inside. */
export function cirTouch(P, side) {
  const d = lnLen(P);
  if (d < 1 + CIR_SAME) return null;
  const turn = Math.acos(1 / d) / CIR_RAD;
  return cirAt(cirDeg(P) + (side === 'right' ? turn : -turn));
}
/**
 * A line: { kind: 'join', a, b (points, y up), runA, runB, center (which end is the center: 'a', 'b' or null) } |
 * { kind: 'tangent', at } | { kind: 'from', P, T (the touch point) }. -> { P, d, length, lo, hi, type }: everything on it
 * is P + s·d; its ends are at s = 0 and s = length; it is drawn from lo to hi.
 */
export function cirLine(l) {
  if (l.kind === 'tangent') return { P: l.at, d: lnPerp(l.at), length: 0, lo: -CIR_TANGENT, hi: CIR_TANGENT, type: 'tangent' };
  if (l.kind === 'from') { const length = lnLen(lnSub(l.T, l.P)); return { P: l.P, d: lnUnit(lnSub(l.T, l.P)), length, lo: 0, hi: length + (l.runB ? CIR_RUN : 0), type: 'tangent' }; }
  const length = lnLen(lnSub(l.b, l.a)), d = lnUnit(lnSub(l.b, l.a)), meets = cirMeets(l.a, d);
  const pastA = Math.max(0, ...meets.map(m => -m).filter(m => m > CIR_SAME)), pastB = Math.max(0, ...meets.map(m => m - length).filter(m => m > CIR_SAME));
  const lo = l.runA ? -(pastA + CIR_RUN) : 0, hi = length + (l.runB ? pastB + CIR_RUN : 0);
  const crossings = meets.filter(m => m > lo - CIR_SAME && m < hi + CIR_SAME).length;
  let type = 'segment';
  if (l.center && (cirOn(l.a) || cirOn(l.b))) type = 'radius';
  else if (cirOn(l.a) && cirOn(l.b)) type = lnLen(lnAdd(l.a, l.b)) < CIR_SAME ? 'diameter' : l.runA && l.runB ? 'secant' : 'chord';
  else if (crossings >= 2) type = 'secant';
  return { P: l.a, d, length, lo, hi, type };
}
/** Does line g, as drawn, run from v toward u (a direction)? */
export function cirRunsFrom(g, v, u) {
  const w = lnSub(v, g.P);
  if (Math.abs(lnCross(g.d, w)) > 1e-7 || Math.abs(Math.abs(lnDot(g.d, u)) - 1) > 1e-7) return false;
  const t = lnDot(w, g.d);
  if (t < g.lo - 1e-7 || t > g.hi + 1e-7) return false;
  return lnDot(g.d, u) > 0 ? t < g.hi - 1e-7 : t > g.lo + 1e-7;
}
/** Where two drawn lines cross, or null. */
export function cirCross(g, h) {
  const k = lnCross(g.d, h.d);
  if (Math.abs(k) < 1e-9) return null;
  const s = lnCross(lnSub(h.P, g.P), h.d) / k, t = lnCross(lnSub(h.P, g.P), g.d) / k;
  if (s < g.lo - 1e-7 || s > g.hi + 1e-7 || t < h.lo - 1e-7 || t > h.hi + 1e-7) return null;
  return lnAdd(g.P, lnMul(g.d, s));
}

/**
 * spec: { lines: [{ id, g (from cirLine), style, box, ticks }], places: [{ id, at, box (its name), dot }], arcs: [{ id,
 * start, sweep (degrees), box, ticks, bold }], angles: [{ id, at, u1, u2 (counterclockwise from u1 to u2), measure, box,
 * arcs, square }], squares: [{ at, u1, u2 }] (right angles marked on their own), shades: [{ kind: 'sector' | 'segment',
 * start, sweep }] }. -> { frame, segments, curves, heads, dots, ticks, arcs, squares, arrows, labels, shades }
 */
export function layoutCircle(spec) {
  const px = p => [p[0] * CIR_R, -p[1] * CIR_R], page = u => [u[0], -u[1]];
  const L = lnLabelSet();
  const segments = spec.lines.map(l => ({ id: l.id, from: px(lnAdd(l.g.P, lnMul(l.g.d, l.g.lo))), to: px(lnAdd(l.g.P, lnMul(l.g.d, l.g.hi))), style: l.style || 'solid' }));
  const arcPath = (start, sweep, r = CIR_R) => {
    const a = px(lnMul(cirAt(start), r / CIR_R)), b = px(lnMul(cirAt(start + sweep), r / CIR_R)), f = v => Math.round(v * 10) / 10;
    if (sweep >= 360 - 1e-9) { const m = px(lnMul(cirAt(start + 180), r / CIR_R)); return `M${f(a[0])},${f(a[1])} A${r},${r} 0 1 0 ${f(m[0])},${f(m[1])} A${r},${r} 0 1 0 ${f(a[0])},${f(a[1])}`; }
    return `M${f(a[0])},${f(a[1])} A${r},${r} 0 ${sweep > 180 ? 1 : 0} 0 ${f(b[0])},${f(b[1])}`;
  };
  const curves = [{ id: 'circle', d: arcPath(90, 360), cls: 'of-circle' }];
  const shades = (spec.shades || []).map(s => {
    const a = px(cirAt(s.start)), f = v => Math.round(v * 10) / 10;
    const arc = arcPath(s.start, s.sweep).replace(/^M[^ ]+ /, '');
    return s.kind === 'sector' ? `M0,0 L${f(a[0])},${f(a[1])} ${arc} Z` : `M${f(a[0])},${f(a[1])} ${arc} Z`;
  });
  const marks = { arcs: [], squares: [] }, ticks = [];
  for (const a of spec.arcs) if (a.bold) curves.push({ id: a.id, d: arcPath(a.start, a.sweep), width: 4.4, cls: 'of-arc-bold' });
  // the rays at a place, on the page, along every drawn line through it
  const raysAt = v => {
    const out = [];
    for (const l of spec.lines) for (const s of [1, -1]) { const u = lnMul(l.g.d, s); if (cirRunsFrom(l.g, v, u)) out.push(page(u)); }
    return out;
  };
  // names: a place on the circle outside it, beside its rays; any other in its widest gap; never on a line or in a
  // marked angle there
  const onLine = (box, [cx, cy]) => segments.some(({ from: [x0, y0], to: [x1, y1] }) => {
    const l = cx - box.w / 2 - 2, r = cx + box.w / 2 + 2, t = cy - (box.asc + box.desc) / 2 - 1, b = cy + (box.asc + box.desc) / 2 + 1;
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    for (const [p, q] of [[-dx, x0 - l], [dx, r - x0], [-dy, y0 - t], [dy, b - y0]]) {
      if (Math.abs(p) < 1e-12) { if (q < 0) return false; } else { const k = q / p; if (p < 0) t0 = Math.max(t0, k); else t1 = Math.min(t1, k); if (t0 > t1) return false; }
    }
    return true;
  });
  const dots = [];
  for (const p of spec.places) {
    const v = px(p.at);
    if (p.dot) dots.push(v);
    if (!p.box) continue;
    const rays = raysAt(p.at).map(u => Math.atan2(-u[1], u[0])).sort((a, b) => a - b);
    let ways = [];
    if (rays.length) {
      const gaps = rays.map((a, i) => { const b = i + 1 < rays.length ? rays[i + 1] : rays[0] + 2 * Math.PI; return { mid: (a + b) / 2, gap: rays.length === 1 ? 2 * Math.PI : b - a }; });
      ways = gaps.sort((a, b) => b.gap - a.gap).map(g => [Math.cos(g.mid), -Math.sin(g.mid)]);
    }
    if (cirOn(p.at)) {
      const out = page(p.at);
      ways = [out, ...ways.filter(w => lnDot(w, out) > 0.2)];
    }
    const round = Array.from({ length: 24 }, (_, i) => { const a = Math.atan2(-(ways[0] || [0, 1])[1], (ways[0] || [0, 1])[0]) + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 12); return [Math.cos(a), -Math.sin(a)]; })
      .filter(w => !cirOn(p.at) || lnDot(w, page(p.at)) > 0.1);
    ways = [...ways, ...round];
    const marked = spec.angles.filter(a => lnLen(lnSub(a.at, p.at)) < 1e-9 && (a.box || a.arcs || a.square));
    const inAngle = w => marked.some(a => { const deg = cirDeg([w[0], -w[1]]); return ((deg - cirDeg(a.u1)) % 360 + 360) % 360 < a.measure; });
    let placed = false;
    for (const extra of [0, 6, 12]) {
      for (const w of ways) {
        const c = lnAdd(v, lnMul(w, 8 + extra + lnReach(p.box, w)));
        if (!L.overlaps(p.box, c) && !onLine(p.box, c) && !inAngle(w)) { L.place(p.id, p.box, c); placed = true; break; }
      }
      if (placed) break;
    }
    if (!placed) L.placeOut(p.id, p.box, v, ways[0] || [0, 1], 8);
  }
  // angles: arcs or a square, the label far enough out to clear them and to fit between the rays
  for (const a of spec.angles) {
    const v = px(a.at), e1 = page(a.u2), e2 = page(a.u1), large = a.measure > 180;
    const midDeg = cirDeg(a.u1) + a.measure / 2, mid = page(cirAt(midDeg));
    const outer = lnAngleMark(marks, v, e1, e2, a.square ? 0 : a.arcs, a.square, large);
    if (!a.box) continue;
    const half = a.measure < 180 ? Math.sin((a.measure * CIR_RAD) / 2) : 1;
    const toSide = a.measure < 180 ? Math.max(...[e1, e2].map(e => (lnReach(a.box, lnPerp(e)) + 3) / half)) : 0;
    let d = Math.max(outer + 5 + lnReach(a.box, mid), Math.min(toSide, outer + 40), 12 + lnReach(a.box, mid));
    for (let n = 0; n < 12 && L.overlaps(a.box, lnAdd(v, lnMul(mid, d))); n++) d += 4;
    L.place(a.id, a.box, lnAdd(v, lnMul(mid, d)));
  }
  for (const s of spec.squares || []) lnAngleMark(marks, px(s.at), page(s.u2), page(s.u1), 0, true, false);
  // lines: ticks across the middle, the label beside it, away from the center
  for (const l of spec.lines) {
    const g = l.g, tangent = g.length === 0, t = page(g.d);
    let midAt = tangent ? g.hi * 0.6 : g.length / 2;
    if (!tangent && lnLen(lnAdd(g.P, lnMul(g.d, midAt))) < 0.05) midAt = g.length * 0.75;
    const m = lnAdd(g.P, lnMul(g.d, midAt)), mid = px(m);
    let nrm = lnPerp(t);
    const through = Math.abs(lnCross(g.d, g.P)) < 1e-6;
    if (through) { if (nrm[1] > 1e-9 || (Math.abs(nrm[1]) <= 1e-9 && nrm[0] < 0)) nrm = lnMul(nrm, -1); }
    else if (lnDot(nrm, page(m)) < 0) nrm = lnMul(nrm, -1);
    if (l.ticks) ticks.push(...lnTicks(mid, t, nrm, l.ticks));
    if (!l.box) continue;
    const gap = l.ticks ? 13 : 6, room = (1 - lnLen(m)) * CIR_R;
    let side = !through && !tangent && room < 2 * lnReach(l.box, nrm) + gap + 6 && lnLen(m) < 1 ? lnMul(nrm, -1) : nrm;
    const spot = w => lnAdd(mid, lnMul(w, gap + lnReach(l.box, w)));
    if (L.overlaps(l.box, spot(side))) side = lnMul(side, -1);
    let c = spot(side);
    for (let k = 1; k <= 16 && L.overlaps(l.box, c); k++) c = [lnAdd(spot(side), lnMul(t, k * 6)), lnAdd(spot(side), lnMul(t, -k * 6))].find(x => !L.overlaps(l.box, x)) || c;
    L.place(l.id, l.box, c);
  }
  // arcs: ticks across the middle, the label outside the circle
  for (const a of spec.arcs) {
    const u = cirAt(a.start + a.sweep / 2), mid = px(u), out = page(u);
    if (a.ticks) ticks.push(...lnTicks(mid, lnPerp(out), out, a.ticks));
    if (a.box) L.placeOut(a.id, a.box, mid, out, a.ticks ? 13 : 7);
  }
  const heads = [];
  for (const l of spec.lines) for (const [cap, end, way] of [[l.capA, l.g.lo, -1], [l.capB, l.g.hi, 1]]) if (cap === 'arrow') heads.push(lnHead(px(lnAdd(l.g.P, lnMul(l.g.d, end))), page(lnMul(l.g.d, way))));
  const frame = lnFrame([[-CIR_R, -CIR_R], [CIR_R, CIR_R], ...segments.flatMap(g => [g.from, g.to]), ...heads.flat()], L.list);
  return { frame, segments, curves, heads, dots, ticks, arcs: marks.arcs, squares: marks.squares, arrows: [], labels: L.list, shades };
}
