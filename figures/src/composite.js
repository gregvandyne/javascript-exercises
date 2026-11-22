// Oomba Figures: composite shapes. A shape made of parts, each in the figure's own units (y up): rectangles, triangles,
// semicircles and circles, joined side to side (a union) or cut out (a difference: cut: true). The outline is worked
// out from the parts, never drawn by hand: a side is outline where the shape is on one side of it and not the other, so
// parts that share an edge show no line between them (dashed split lines show how it breaks into parts, if asked).
// Everything it says is true: a side's label states its true length, the parts may not overlap (the area would count
// twice), a cut must lie inside the shape, and the parts must hang together. OF.solve.compositeShape gives the area
// (the parts added, the cuts taken away), the perimeter (straight sides and arcs) and each part's area. Oomba's own
// code: the original's composite shape is an interactive editor and is not ported; this kind takes its parts as data.
import { node, frame, palette, isNum, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { mathBox, mathNode, mathText } from './mathtext.js';
import { gmCommon, gmClaim, gmAgrees, gmLabelProblem, gmRound } from './lines.js';
import { lnLabelSet, lnFrame } from './ported/lines.js';

const CMP_MAX_PARTS = 8;
const CMP_ARC_STEPS = 96;            // a semicircle's curve, as this many short chords (a circle: twice as many)
const CMP_FIT_W = 440;
const CMP_FIT_H = 320;
const CMP_KEYS = ['kind', 'hide', 'parts', 'sides', 'labels', 'splits', 'shade', 'unit', 'round', 'size'];
const cmpCross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const cmpArea = pts => pts.reduce((t, p, i) => { const q = pts[(i + 1) % pts.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const cmpLen = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const cmpPt = v => Array.isArray(v) && v.length === 2 && v.every(x => isNum(x, -1e4, 1e4));
/** Is p inside a convex counterclockwise polygon (strictly, by eps)? */
const cmpInside = (pts, p, eps = 1e-9) => pts.every((a, i) => cmpCross(a, pts[(i + 1) % pts.length], p) > eps * Math.max(1, cmpLen(a, pts[(i + 1) % pts.length])));
/** The part of polygon subject inside convex polygon clip (Sutherland-Hodgman). */
function cmpClip(subject, clip) {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length], cp = cmpCross(a, b, p), cq = cmpCross(a, b, q);
      if (cp >= 0) out.push(p);
      if ((cp >= 0) !== (cq >= 0)) { const t = cp / (cp - cq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out;
}

/** A part from the data -> { kind, poly (counterclockwise), area (exact), curve (which edges are on its curve), center, r } or a problem. */
function cmpPart(p, i) {
  const at = `part ${i + 1}`;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return `${at} must be { "rect": [x, y, w, h] }, { "tri": [[x, y], [x, y], [x, y]] }, { "semicircle": [[x, y], [x, y]] } or { "circle": [x, y, r] }`;
  const shape = ['rect', 'tri', 'semicircle', 'circle'].filter(k => k in p);
  const odd = Object.keys(p).filter(k => !['rect', 'tri', 'semicircle', 'circle', 'cut', 'radius'].includes(k));
  if (shape.length !== 1 || odd.length) return `${at} must be exactly one of rect, tri, semicircle, circle (with cut: true to cut it out, radius for a circle's or semicircle's radius)${odd.length ? `: it does not take "${odd[0]}"` : ''}`;
  if (p.cut !== undefined && typeof p.cut !== 'boolean') return `${at}: "cut" must be true or false`;
  const k = shape[0], v = p[k];
  if (k === 'rect') {
    if (!Array.isArray(v) || v.length !== 4 || !v.every(x => isNum(x, -1e4, 1e4)) || !(v[2] > 0 && v[3] > 0)) return `${at}: "rect" must be [x, y, width, height] (its bottom left corner, then its size above 0)`;
    const [x, y, w, h] = v;
    return { kind: k, poly: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], area: w * h, curve: new Set() };
  }
  if (k === 'tri') {
    if (!Array.isArray(v) || v.length !== 3 || !v.every(cmpPt)) return `${at}: "tri" must be its three corners [[x, y], [x, y], [x, y]]`;
    const a = cmpArea(v);
    if (Math.abs(a) < 1e-9) return `${at}: the triangle's corners are on one line`;
    return { kind: k, poly: a > 0 ? v.map(q => q.slice()) : [v[0], v[2], v[1]].map(q => q.slice()), area: Math.abs(a), curve: new Set() };
  }
  if (k === 'semicircle') {
    if (!Array.isArray(v) || v.length !== 2 || !v.every(cmpPt) || cmpLen(v[0], v[1]) < 1e-9) return `${at}: "semicircle" must be the two ends of its diameter [[x, y], [x, y]]; it bulges to the left going from the first to the second`;
    const [a, b] = v, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r = cmpLen(a, b) / 2, a0 = Math.atan2(b[1] - m[1], b[0] - m[0]);
    const poly = [a, b];
    for (let s = 1; s < CMP_ARC_STEPS; s++) { const t = a0 + (Math.PI * s) / CMP_ARC_STEPS; poly.push([m[0] + r * Math.cos(t), m[1] + r * Math.sin(t)]); }
    return { kind: k, poly, area: (Math.PI * r * r) / 2, curve: new Set(Array.from({ length: CMP_ARC_STEPS }, (_, s) => s + 1)), center: m, r, mid: [m[0] + r * Math.cos(a0 + Math.PI / 2), m[1] + r * Math.sin(a0 + Math.PI / 2)] };
  }
  if (!Array.isArray(v) || v.length !== 3 || !v.every(x => isNum(x, -1e4, 1e4)) || !(v[2] > 0)) return `${at}: "circle" must be [x, y, r] (its center and radius above 0)`;
  const [cx, cy, r] = v, n = 2 * CMP_ARC_STEPS;
  return { kind: k, poly: Array.from({ length: n }, (_, s) => [cx + r * Math.cos((2 * Math.PI * s) / n), cy + r * Math.sin((2 * Math.PI * s) / n)]), area: Math.PI * r * r, curve: new Set(Array.from({ length: n }, (_, s) => s)), center: [cx, cy], r, mid: [cx + r, cy] };
}
/** How long a chord on a curve of n chords per half turn stands for, as arc: the arc it cuts off. */
const cmpArcFactor = n => { const th = Math.PI / n; return th / 2 / Math.sin(th / 2); };

function cmpRead(d) {
  const out = [];
  const odd = Object.keys(d).filter(k => !CMP_KEYS.includes(k));
  if (odd.length) return { problems: [`compositeShape does not take "${odd[0]}" (it takes ${CMP_KEYS.slice(2).join(', ')})`] };
  const c = gmCommon(d, out, { bools: ['shade'] });
  if (!Array.isArray(d.parts) || !d.parts.length || d.parts.length > CMP_MAX_PARTS) return { problems: [...out, `"parts" must list 1 to ${CMP_MAX_PARTS} parts, like [{ "rect": [0, 0, 8, 3] }, { "rect": [0, 3, 3, 4] }]`] };
  const parts = d.parts.map((p, i) => { const x = cmpPart(p, i); if (typeof x === 'string') { out.push(x); return null; } x.cut = p.cut === true; x.radius = p.radius; x.i = i; return x; });
  for (const p of parts) if (p && p.radius !== undefined) {
    if (!p.center) out.push(`part ${p.i + 1}: "radius" is for a circle or a semicircle`);
    else { const why = gmLabelProblem(p.radius, `the radius of part ${p.i + 1}`); if (why) out.push(why); }
  }
  if (out.length) return { problems: out };
  const adds = parts.filter(p => !p.cut), cuts = parts.filter(p => p.cut);
  if (!adds.length) return { problems: ['a composite shape needs at least one part that is not cut out'] };
  // the truth of the parts: no overlaps, cuts inside, one piece
  const problems = [];
  const over = (a, b) => { const q = cmpClip(a.poly, b.poly); return q.length >= 3 ? Math.abs(cmpArea(q)) : 0; };
  for (let i = 0; i < adds.length; i++) for (let j = i + 1; j < adds.length; j++) if (over(adds[i], adds[j]) > 1e-6 * Math.min(adds[i].area, adds[j].area) + 1e-9) problems.push(`parts ${adds[i].i + 1} and ${adds[j].i + 1} overlap: the area would count that piece twice (join parts side to side)`);
  for (const cpart of cuts) {
    const inside = adds.reduce((t, a) => t + over(cpart, a), 0), polyArea = Math.abs(cmpArea(cpart.poly));
    if (inside < polyArea * (1 - 1e-4)) problems.push(`part ${cpart.i + 1} is cut out, so it must lie inside the shape`);
  }
  for (let i = 0; i < cuts.length; i++) for (let j = i + 1; j < cuts.length; j++) if (over(cuts[i], cuts[j]) > 1e-9) problems.push(`parts ${cuts[i].i + 1} and ${cuts[j].i + 1} are both cut out and overlap`);
  const touch = (a, b) => a.poly.some((p, i) => { const q = a.poly[(i + 1) % a.poly.length]; return b.poly.some((u, j) => { const w = b.poly[(j + 1) % b.poly.length]; if (Math.abs(cmpCross(p, q, u)) > 1e-7 || Math.abs(cmpCross(p, q, w)) > 1e-7) return false; const L = cmpLen(p, q), t = x => ((x[0] - p[0]) * (q[0] - p[0]) + (x[1] - p[1]) * (q[1] - p[1])) / L; const lo = Math.max(0, Math.min(t(u), t(w))), hi = Math.min(L, Math.max(t(u), t(w))); return hi - lo > 1e-6; }); });
  const seen = new Set([0]), queue = [0];
  while (queue.length) { const k = queue.pop(); adds.forEach((b, j) => { if (!seen.has(j) && touch(adds[k], b)) { seen.add(j); queue.push(j); } }); }
  if (seen.size < adds.length && !problems.length) problems.push('the parts must join side to side into one shape (a part shares no side with the rest)');
  if (problems.length) return { problems };
  // the outline: every piece of every part's edge with the shape on one side of it and not the other
  const inShape = p => adds.some(a => cmpInside(a.poly, p)) && !cuts.some(k => cmpInside(k.poly, p));
  const scale = Math.max(...parts.flatMap(p => p.poly.flat().map(Math.abs)), 1);
  const edges = [];
  for (const p of parts) p.poly.forEach((a, i) => {
    const b = p.poly[(i + 1) % p.poly.length], ts = [0, 1];
    for (const q of parts) q.poly.forEach((u, j) => {
      const w = q.poly[(j + 1) % q.poly.length], dx = b[0] - a[0], dy = b[1] - a[1], ex = w[0] - u[0], ey = w[1] - u[1], den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) {
        if (Math.abs(cmpCross(a, b, u)) < 1e-9 * scale * scale) for (const x of [u, w]) { const t = ((x[0] - a[0]) * dx + (x[1] - a[1]) * dy) / (dx * dx + dy * dy); if (t > 1e-9 && t < 1 - 1e-9) ts.push(t); }
        return;
      }
      const t = ((u[0] - a[0]) * ey - (u[1] - a[1]) * ex) / den, s = ((u[0] - a[0]) * dy - (u[1] - a[1]) * dx) / den;
      if (t > 1e-9 && t < 1 - 1e-9 && s > -1e-9 && s < 1 + 1e-9) ts.push(t);
    });
    ts.sort((x, y) => x - y);
    const L = cmpLen(a, b), nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, eps = 1e-6 * scale;
    for (let k = 0; k + 1 < ts.length; k++) {
      if (ts[k + 1] - ts[k] < 1e-9) continue;
      const P = [a[0] + (b[0] - a[0]) * ts[k], a[1] + (b[1] - a[1]) * ts[k]], Q = [a[0] + (b[0] - a[0]) * ts[k + 1], a[1] + (b[1] - a[1]) * ts[k + 1]];
      const m = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2], left = inShape([m[0] + nx * eps, m[1] + ny * eps]), right = inShape([m[0] - nx * eps, m[1] - ny * eps]);
      if (left === right) continue;
      const key = `${r2(Math.min(P[0], Q[0]) * 1e3)},${r2(Math.min(P[1], Q[1]) * 1e3)},${r2(Math.max(P[0], Q[0]) * 1e3)},${r2(Math.max(P[1], Q[1]) * 1e3)}`;
      if (edges.some(e => e.key === key)) continue;
      edges.push({ key, P, Q, out: left ? [-nx, -ny] : [nx, ny], curve: p.curve.has(i), part: p });
    }
  });
  // straight sides: pieces of outline along one line, end to end, joined
  const straight = edges.filter(e => !e.curve), sides = [], used = new Set();
  straight.forEach((e, i) => {
    if (used.has(i)) return;
    used.add(i);
    let [P, Q] = [e.P, e.Q], grew = true;
    while (grew) {
      grew = false;
      straight.forEach((f, j) => {
        if (used.has(j) || Math.abs(cmpCross(P, Q, f.P)) > 1e-9 * scale * scale || Math.abs(cmpCross(P, Q, f.Q)) > 1e-9 * scale * scale || f.out[0] * e.out[0] + f.out[1] * e.out[1] < 0.999) return;
        for (const [x, y] of [[f.P, f.Q], [f.Q, f.P]]) {
          if (cmpLen(x, Q) < 1e-9 * scale) { Q = y; used.add(j); grew = true; return; }
          if (cmpLen(x, P) < 1e-9 * scale) { P = y; used.add(j); grew = true; return; }
        }
      });
    }
    sides.push({ P, Q, out: e.out, length: cmpLen(P, Q) });
  });
  const curved = edges.filter(e => e.curve);
  const perimeter = sides.reduce((t, s) => t + s.length, 0) + curved.reduce((t, e) => t + cmpLen(e.P, e.Q) * cmpArcFactor(e.part.kind === 'circle' ? CMP_ARC_STEPS : CMP_ARC_STEPS), 0);
  // labels: whole sides of the outline, split lines inside it, radii
  const sideAt = (f, t) => sides.find(s => (cmpLen(s.P, f) < 1e-6 && cmpLen(s.Q, t) < 1e-6) || (cmpLen(s.P, t) < 1e-6 && cmpLen(s.Q, f) < 1e-6));
  const labels = [];
  if (d.sides !== undefined && typeof d.sides !== 'boolean') out.push('"sides" must be true (every straight side of the outline labeled with its length) or false');
  if (d.labels !== undefined && !Array.isArray(d.labels)) out.push('"labels" must be a list, like [{ "from": [0, 0], "to": [8, 0], "label": true }]');
  for (const [k, l] of (Array.isArray(d.labels) ? d.labels : []).entries()) {
    const at = `label ${k + 1}`;
    if (!l || !cmpPt(l.from) || !cmpPt(l.to)) { out.push(`${at} must be { "from": [x, y], "to": [x, y], "label" } (a whole side of the outline)`); continue; }
    const s = sideAt(l.from, l.to);
    if (!s) { out.push(`${at}: from (${l.from.join(', ')}) to (${l.to.join(', ')}) is not a whole side of the outline (its sides: ${sides.map(x => `(${r2(x.P[0])}, ${r2(x.P[1])}) to (${r2(x.Q[0])}, ${r2(x.Q[1])})`).join('; ')})`); continue; }
    const why = gmLabelProblem(l.label, `the label of ${at}`); if (why) out.push(why);
    labels.push({ side: s, label: l.label === undefined ? true : l.label, name: `the side from (${l.from.join(', ')}) to (${l.to.join(', ')})` });
  }
  if (d.sides === true) for (const s of sides) if (!labels.some(l => l.side === s)) labels.push({ side: s, label: true });
  const splits = [];
  if (d.splits !== undefined && !Array.isArray(d.splits)) out.push('"splits" must be a list, like [{ "from": [3, 0], "to": [3, 3] }]');
  for (const [k, sp] of (Array.isArray(d.splits) ? d.splits : []).entries()) {
    if (!sp || !cmpPt(sp.from) || !cmpPt(sp.to) || cmpLen(sp.from, sp.to) < 1e-9) { out.push(`split ${k + 1} must be { "from": [x, y], "to": [x, y], "label" }`); continue; }
    const len = cmpLen(sp.from, sp.to), e = 1e-6 * scale, n = [-(sp.to[1] - sp.from[1]) / len * e, (sp.to[0] - sp.from[0]) / len * e];
    const inner = [0.25, 0.5, 0.75].every(t => { const q = [sp.from[0] + (sp.to[0] - sp.from[0]) * t, sp.from[1] + (sp.to[1] - sp.from[1]) * t]; return inShape(q) || (inShape([q[0] + n[0], q[1] + n[1]]) && inShape([q[0] - n[0], q[1] - n[1]])); });
    if (!inner) { out.push(`split ${k + 1} must run inside the shape (a dashed line showing how it breaks into parts)`); continue; }
    const why = gmLabelProblem(sp.label, `the label of split ${k + 1}`); if (why) out.push(why);
    splits.push({ P: sp.from, Q: sp.to, length: cmpLen(sp.from, sp.to), label: sp.label === undefined ? false : sp.label, name: `the split from (${sp.from.join(', ')}) to (${sp.to.join(', ')})` });
  }
  if (out.length) return { problems: out };
  for (const l of [...labels.map(x => ({ ...x, length: x.side.length })), ...splits, ...parts.filter(p => p.radius !== undefined).map(p => ({ length: p.r, label: p.radius, name: `the radius of part ${p.i + 1}` }))]) {
    const cl = l.label === true || l.label === false ? null : gmClaim(l.label, c.unit);
    if (cl !== null && !gmAgrees(cl, l.length, false)) problems.push(`${l.name} is labeled ${mathText(l.label)} but it is ${r2(l.length)}: a label that states a number must state the true length`);
  }
  if (problems.length) return { problems };
  const area = adds.reduce((t, p) => t + p.area, 0) - cuts.reduce((t, p) => t + p.area, 0);
  return { problems: [], c, parts, adds, cuts, edges, sides, curved, labels, splits, area, perimeter, inShape, shade: d.shade === true };
}

export const compositeShape = {
  check(d) { return cmpRead(d).problems; },
  /** The numbers: the area (parts added, cuts taken away), the perimeter (the outline's straight sides and arcs; a cut
   *  hole's edge counts too), each part's area (a cut's as a positive number, with cut: true), and the outline's sides. */
  solve(d) {
    const r = cmpRead(d);
    if (r.problems.length) return null;
    return { area: r.area, perimeter: r.perimeter, parts: r.parts.map(p => ({ kind: p.kind, area: p.area, cut: p.cut })), sides: r.sides.map(s => ({ from: s.P, to: s.Q, length: s.length })) };
  },
  draw(d, o) {
    const r = cmpRead(d), c = r.c, lang = o.lang, W = figWords(lang), Pal = palette(o), FS = 20 * c.scale, unit = c.unit ? ` ${c.unit}` : '';
    const pts = r.parts.flatMap(p => p.poly), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const k = Math.min(CMP_FIT_W / (Math.max(...xs) - Math.min(...xs) || 1), CMP_FIT_H / (Math.max(...ys) - Math.min(...ys) || 1));
    const x0 = Math.min(...xs), y1 = Math.max(...ys), at = p => [(p[0] - x0) * k, (y1 - p[1]) * k], X = r2;
    const L = lnLabelSet(), hidden = g => o.hide === true || hides(o, g);
    const box = (l, v) => (l === false || l === undefined ? null : l === true ? mathBox(gmRound(v, c.round), FS, { lang, suffix: unit }) : mathBox(l, FS, { lang, suffix: typeof l === 'number' ? unit : undefined }));
    for (const l of r.labels) {
      const b = hidden('sides') ? null : box(l.label, l.side.length); if (!b) continue;
      const m = at([(l.side.P[0] + l.side.Q[0]) / 2, (l.side.P[1] + l.side.Q[1]) / 2]), out = [l.side.out[0], -l.side.out[1]];
      L.placeOut('side', b, m, out, 6);
    }
    for (const s of r.splits) {
      const b = hidden('splits') ? null : box(s.label, s.length); if (!b) continue;
      const P = at(s.P), Q = at(s.Q), m = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2], len = Math.hypot(Q[0] - P[0], Q[1] - P[1]), n = [-(Q[1] - P[1]) / len, (Q[0] - P[0]) / len];
      L.placeOut('split', b, m, n[1] > 0 ? [-n[0], -n[1]] : n, 6);
    }
    const radii = [];
    for (const p of r.parts) if (p.radius !== undefined) {
      const C = at(p.center), E = at(p.mid);
      radii.push([C, E]);
      const b = hidden('radius') ? null : box(p.radius, p.r);
      if (b) { const len = Math.hypot(E[0] - C[0], E[1] - C[1]), n = [-(E[1] - C[1]) / len, (E[0] - C[0]) / len]; L.placeOut('radius', b, [(C[0] + E[0]) / 2, (C[1] + E[1]) / 2], n[1] > 0 ? [-n[0], -n[1]] : n, 6); }
    }
    const F = lnFrame(pts.map(at), L.list), kids = [];
    const poly = (p, fill) => node('polygon', { points: p.poly.map(at).map(([x, y]) => `${X(x)},${X(y)}`).join(' '), fill, stroke: fill, 'stroke-width': 0.6, class: 'of-fill' });
    const fill = r.shade ? (o.print ? '#D9D9D9' : '#B8DEBE') : o.print ? 'none' : Pal.fill;
    for (const p of r.adds) kids.push(poly(p, fill));
    for (const p of r.cuts) kids.push(poly(p, o.print ? '#FFFFFF' : Pal.paper));
    for (const s of r.splits) { const P = at(s.P), Q = at(s.Q); kids.push(node('line', { x1: X(P[0]), y1: X(P[1]), x2: X(Q[0]), y2: X(Q[1]), stroke: Pal.ink2, 'stroke-width': 1.8, 'stroke-dasharray': '7 5', class: 'of-split' })); }
    for (const [C, E] of radii) kids.push(node('line', { x1: X(C[0]), y1: X(C[1]), x2: X(E[0]), y2: X(E[1]), stroke: Pal.ink2, 'stroke-width': 1.8, 'stroke-dasharray': '7 5', class: 'of-radius' }), node('circle', { cx: X(C[0]), cy: X(C[1]), r: 3.5, fill: Pal.ink, class: 'of-center' }));
    const outline = [...r.sides.map(s => [s.P, s.Q]), ...r.curved.map(e => [e.P, e.Q])];
    kids.push(node('path', { d: outline.map(([P, Q]) => { const a = at(P), b = at(Q); return `M${X(a[0])},${X(a[1])}L${X(b[0])},${X(b[1])}`; }).join(''), fill: 'none', stroke: Pal.ink, 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'of-shape' }));
    for (const l of L.list) kids.push(node('g', { class: 'of-label', 'data-part': l.part }, mathNode(l.box, X(l.x), X(l.y), { color: Pal.ink, halo: o.print ? null : Pal.paper })));
    return frame(F.w, F.h, [node('g', { transform: `translate(${r2(-F.x)} ${r2(-F.y)})` }, kids)], { ...o, kind: 'compositeShape' }, o.title || W('compositeShape'));
  },
};
export const COMPOSITE_KINDS = { compositeShape };
