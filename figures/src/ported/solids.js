// Oomba Figures: the geometry behind the 3D solids. Which measures a prism, cylinder, pyramid, cone, sphere or hemisphere
// has, and the ones worked out from the others (an oblique prism or cylinder from any two of its height, lean and slanted
// edge; a right pyramid or cone from its height or its slant height); then the solid built in 3D (x to the right, y up,
// z back) and drawn flat the way textbooks draw one: a prism or pyramid with its front face square-on and its depth
// running back at 45 degrees at half length (oblique projection), a round solid seen from a little above so its circles
// become level ovals. Each edge is hidden (drawn dashed) when no face that holds it faces the viewer; a round solid's
// outline is worked out where its sides touch its ovals. The lines its measures sit on (a height, a radius, a slant
// height, a lean), the right-angle squares and the labels are laid out around it, clear of each other, and the frame
// grows to hold them. Pure numbers in, pure numbers out: figures/src/solids.js reads the data, checks it and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the measures arrive as numbers worked out from Oomba's structured values,
// not typed text read by a math input library, and the reader no longer fills in a missing slanted edge or slant height
// silently from a stale field: the caller passes exactly what was given; messages name the measure in the same plain
// words; measures that must fit together (a height, lean and slanted edge; a height and slant height) may differ by the
// caller's slack (1%, as Oomba's flat shapes allow), not one part in a million; labels are laid out by Oomba's own math label typesetter (mathtext.js) through a callback, so the caller decides
// what each part says (and checks that it is true); a diameter is given as its own measure rather than as a flag on the
// radius; corner names come from the caller; the label dragging (moved labels kept in the page address) and the
// label-size setting are left out (a scale factor instead); the settings, page address and preset code is left out.
import { mathBox } from '../mathtext.js';

const SD_FIT_W = 420;       // the box every solid is scaled to fit
const SD_FIT_H = 300;
const SD_PAD = 12;
const SD_SQUARE = 12;       // right-angle square
const SD_DEPTH = 0.5;       // how much depth is shortened
const SD_SLOPE = Math.SQRT1_2; // depth runs back at 45 degrees
const SD_NEAR = 1e-6;

const sdAdd = (p, q) => [p[0] + q[0], p[1] + q[1]];
const sdSub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const sdMul = (p, k) => [p[0] * k, p[1] * k];
const sdDot = (p, q) => p[0] * q[0] + p[1] * q[1];
const sdLen = p => Math.hypot(p[0], p[1]);
const sdUnit = p => sdMul(p, 1 / (sdLen(p) || 1));
const sdPerp = p => [-p[1], p[0]];
const sdR1 = v => Math.round(v * 10) / 10;
const sdReach = (box, d) => (box.w / 2) * Math.abs(d[0]) + ((box.asc + box.desc) / 2) * Math.abs(d[1]);
const sdAdd3 = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const sdSub3 = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const sdDot3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const sdCross3 = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const sdAvg3 = ps => ps.reduce((t, p) => sdAdd3(t, p), [0, 0, 0]).map(c => c / ps.length);
const sdMidV = (p, q) => sdMul(sdAdd(p, q), 0.5);
/** A number for a message: at most two decimals, a true minus sign. */
const sdShow = v => String(Number(v.toFixed(2))).replace('-', '−');

/** A corner's name when none is given: A, B, C ... Z, then A1 style doubles. */
export const sdLetter = i => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '');

/**
 * Which parts a solid has. form: { shape: 'prism' | 'cylinder' | 'pyramid' | 'cone' | 'sphere' | 'hemisphere', base:
 * 'rectangle' | 'right' | 'isosceles' | 'regular', sides, lie, oblique } -> the parts, in order.
 */
export function sdParts(form) {
  const { shape, base, oblique } = form, parts = [];
  if (shape === 'prism' || shape === 'pyramid') {
    if (base === 'rectangle') parts.push('length', 'width');
    else if (base === 'regular') parts.push('side', 'apothem');
    else if (shape === 'prism') parts.push('triBase', 'triHeight', 'hyp');
  }
  if (shape === 'cylinder' || shape === 'cone' || shape === 'sphere' || shape === 'hemisphere') parts.push('radius');
  if (shape !== 'sphere' && shape !== 'hemisphere') parts.push('height');
  if (oblique) parts.push('lean');
  if (oblique && (shape === 'prism' || shape === 'cylinder')) parts.push('edge');
  if (!oblique && (shape === 'pyramid' || shape === 'cone')) parts.push('slant');
  return parts;
}

/**
 * Every part's measure from the ones given (given: { part: number }, a radius already halved from a diameter).
 * -> { values } or { problem } in plain words. name(part) says what a part is called in a message; slack: how far apart
 * (a fraction) two measures that must fit together may be, since teachers give rounded values.
 */
export function sdSolve(form, given, name, slack = SD_NEAR) {
  const sdNear = (a, b) => Math.abs(a - b) <= slack * Math.max(a, b);
  const parts = sdParts(form), has = k => parts.includes(k), g = k => (given[k] === undefined ? null : given[k]);
  const needed = parts.filter(k => ['length', 'width', 'triBase', 'triHeight', 'side', 'radius'].includes(k));
  if (!form.oblique && (form.shape === 'prism' || form.shape === 'cylinder')) needed.push('height');
  if (form.oblique && (form.shape === 'pyramid' || form.shape === 'cone')) needed.push('height', 'lean');
  const missing = needed.find(k => g(k) === null);
  if (missing) return { problem: `give the ${name(missing)}` };
  const v = { ...given };
  if (form.base === 'right' && has('hyp')) v.hyp = Math.hypot(v.triBase, v.triHeight);
  if (form.base === 'isosceles' && has('hyp')) v.hyp = Math.hypot(v.triBase / 2, v.triHeight);
  if (has('apothem')) v.apothem = v.side / (2 * Math.tan(Math.PI / form.sides));
  // an oblique prism or cylinder: any two of its height, lean and slanted edge
  if (form.oblique && has('edge')) {
    const [h, l, e] = [g('height'), g('lean'), g('edge')], count = [h, l, e].filter(x => x !== null).length;
    if (count < 2) return { problem: `give two of the ${name('height')}, the ${name('lean')} and the ${name('edge')}` };
    if (e !== null && ((h !== null && e <= h) || (l !== null && e <= l))) return { problem: `the ${name('edge')} must be longer than the ${name('height')} and the ${name('lean')}` };
    if (count === 3 && !sdNear(e, Math.hypot(h, l))) return { problem: `the ${name('height')}, ${name('lean')} and ${name('edge')} do not fit together (the edge would be ${sdShow(Math.hypot(h, l))}): leave one out to have it worked out` };
    v.height = h ?? Math.sqrt(e * e - l * l);
    v.lean = l ?? Math.sqrt(e * e - h * h);
    v.edge = e ?? Math.hypot(h, l);
  }
  // a right pyramid or cone: its height or its slant height, down to the middle of its base's front edge
  if (has('slant')) {
    const inner = form.shape === 'cone' ? v.radius : form.base === 'regular' ? v.apothem : v.width / 2;
    const innerName = form.shape === 'cone' ? `the ${name('radius')}` : form.base === 'regular' ? `the ${name('apothem')} (${sdShow(inner)})` : `half the ${name('width')}`;
    const [h, sl] = [g('height'), g('slant')];
    if (h === null && sl === null) return { problem: `give the ${name('height')} or the ${name('slant')}` };
    if (sl !== null && sl <= inner) return { problem: `the ${name('slant')} must be longer than ${innerName}` };
    if (h !== null && sl !== null && !sdNear(sl, Math.hypot(h, inner))) return { problem: `the ${name('height')} and ${name('slant')} do not fit together (with this height the slant height is ${sdShow(Math.hypot(h, inner))}): leave one out to have it worked out` };
    v.height = h ?? Math.sqrt(sl * sl - inner * inner);
    v.slant = sl ?? Math.hypot(h, inner);
  }
  return { values: v };
}

/** A base as a flat polygon, counterclockwise from its front left corner, its front edge first. */
export function sdBase(base, sides, v) {
  if (base === 'rectangle') return [[0, 0], [v.length, 0], [v.length, v.width], [0, v.width]];
  if (base === 'right') return [[0, 0], [v.triBase, 0], [0, v.triHeight]];
  if (base === 'isosceles') return [[0, 0], [v.triBase, 0], [v.triBase / 2, v.triHeight]];
  const R = v.side / (2 * Math.sin(Math.PI / sides));
  return Array.from({ length: sides }, (_, i) => {
    const a = -Math.PI / 2 - Math.PI / sides + (i * 2 * Math.PI) / sides;
    return [R * Math.cos(a), R * Math.sin(a)];
  });
}
/** A face's normal (Newell's method), pointing whichever way its corners wind. */
function sdNormal(ps) {
  const n = [0, 0, 0];
  ps.forEach((p, i) => {
    const q = ps[(i + 1) % ps.length];
    n[0] += (p[1] - q[1]) * (p[2] + q[2]);
    n[1] += (p[2] - q[2]) * (p[0] + q[0]);
    n[2] += (p[0] - q[0]) * (p[1] + q[1]);
  });
  return n;
}
/**
 * A polyhedron's corners (3D) and faces (lists of corner indexes) from its form and values: a prism standing on its base
 * or lying on its side, a pyramid with its apex over its base's middle (moved by the lean). Also its faces' areas.
 */
export function sdPolyhedron(form, v, leanX = 0) {
  const base = sdBase(form.base, form.sides, v), n = base.length;
  let corners, faces;
  if (form.shape === 'prism') {
    const h = v.height;
    corners = form.lie ? [...base.map(([u, w]) => [u, w, 0]), ...base.map(([u, w]) => [u, w, h])]
      : [...base.map(([u, w]) => [u, 0, w]), ...base.map(([u, w]) => [u + leanX, h, w])];
    faces = [base.map((_, i) => i), base.map((_, i) => n + i), ...base.map((_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i])];
  } else {
    const c = sdAvg3(base.map(([u, w]) => [u, 0, w]));
    corners = [...base.map(([u, w]) => [u, 0, w]), [c[0] + leanX, v.height, c[2]]];
    faces = [base.map((_, i) => i), ...base.map((_, i) => [i, (i + 1) % n, n])];
  }
  const area = f => { const ps = f.map(i => corners[i]); return Math.hypot(...sdNormal(ps)) / 2; };
  return { corners, faces, n, areas: faces.map(area) };
}

/**
 * Lay a solid out. spec: { form, v (every part's measure, drawn), dir (1: depth runs back to the right, -1: left), ld
 * (the lean's way, 1 or -1), bowl (a hemisphere with its flat face up), hidden (draw hidden edges), showHeight, square
 * (right-angle squares), names (a list of corner names, or null), content(part) -> a math box or null (what is written
 * at a part), nameSize, scale }. -> { frame, edges: [{ a, b, hidden }], arcs: [{ d, hidden }], extras: [{ a, b, dashed,
 * part }], squares, dots, labels: [{ part, box, cx, cy, x, y }] }
 */
export function layoutSolid(spec) {
  const { form, v } = spec, k = spec.scale || 1;
  const dir = spec.dir === -1 ? -1 : 1, ld = spec.ld === -1 ? -1 : 1;
  const lean = form.oblique ? v.lean * ld : 0;
  const round = !(form.shape === 'prism' || form.shape === 'pyramid');
  const flat = ([x, y, z]) => (round ? [x, -(y + z * SD_DEPTH * SD_SLOPE)] : [x + dir * z * SD_DEPTH * SD_SLOPE, -(y + z * SD_DEPTH * SD_SLOPE)]);
  /** Seen along this direction, a point and everything behind it land on the same spot. */
  const view = [-dir * SD_DEPTH * SD_SLOPE, -SD_DEPTH * SD_SLOPE, 1];

  // ---- the solid in 3D
  let corners = [], faces = [], bottomCount = 0, apex = null, sphere = null;
  const circles = [], r = v.radius || 0;
  if (!round) {
    const P = sdPolyhedron(form, v, lean);
    corners = P.corners; faces = P.faces; bottomCount = P.n;
    if (form.shape === 'pyramid') apex = corners[P.n];
  } else if (form.shape === 'cylinder') circles.push({ c: [0, 0, 0], r }, { c: [lean, v.height, 0], r });
  else if (form.shape === 'cone') { circles.push({ c: [0, 0, 0], r }); apex = [lean, v.height, 0]; }
  else { sphere = { c: [0, 0, 0], r }; circles.push({ c: [0, 0, 0], r }); }

  // ---- scaled to fit
  const raw = corners.map(flat);
  if (apex && round) raw.push(flat(apex));
  const ry = rad => rad * SD_DEPTH * SD_SLOPE;   // a level circle's oval is this tall either side of its middle
  for (const c of circles) { const m = flat(c.c); raw.push([m[0] - c.r, m[1] - ry(c.r)], [m[0] + c.r, m[1] + ry(c.r)]); }
  if (sphere) {
    const m = flat(sphere.c), up = form.shape === 'hemisphere' && spec.bowl ? 0 : sphere.r, down = form.shape === 'hemisphere' && !spec.bowl ? ry(sphere.r) : sphere.r;
    raw.push([m[0] - sphere.r, m[1] - up], [m[0] + sphere.r, m[1] + down]);
  }
  if (form.oblique) {
    // heights dropped outside the solid land level with its base
    const tops = form.shape === 'prism' ? corners.slice(bottomCount) : form.shape === 'cylinder' ? [circles[1].c] : [apex];
    for (const p of tops) raw.push(flat([p[0], 0, p[2]]));
  }
  const xs = raw.map(p => p[0]), ys = raw.map(p => p[1]);
  const scale = k * Math.min(SD_FIT_W / (Math.max(...xs) - Math.min(...xs) || 1), SD_FIT_H / (Math.max(...ys) - Math.min(...ys) || 1));
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const at = p => { const [x, y] = flat(p); return [(x - x0) * scale, (y - y0) * scale]; };

  const edges = [], arcs = [], extras = [], squares = [], dots = [], outline = [];

  // ---- edges: hidden when no face that holds it faces the viewer
  const pts = corners.map(at);
  if (!round) {
    const centroid = sdAvg3(corners);
    const facing = faces.map(f => {
      const nrm = sdNormal(f.map(i => corners[i]));
      const out = sdDot3(nrm, sdSub3(sdAvg3(f.map(i => corners[i])), centroid)) < 0 ? -1 : 1;
      return out * sdDot3(nrm, view) < 0;
    });
    const seen = new Map();
    faces.forEach((f, fi) => f.forEach((a, j) => {
      const b = f[(j + 1) % f.length], key = a < b ? `${a}-${b}` : `${b}-${a}`;
      seen.set(key, (seen.get(key) || false) || facing[fi]);
    }));
    for (const [key, visible] of seen) { const [a, b] = key.split('-').map(Number); edges.push({ a: pts[a], b: pts[b], hidden: !visible }); }
    outline.push(...pts);
  }

  // ---- curved outlines
  const oval = (c, rad) => ({ m: at(c), rx: rad * scale, ry: ry(rad) * scale });
  const onOval = (o, phi) => [o.m[0] + o.rx * Math.cos(phi), o.m[1] + o.ry * Math.sin(phi)];
  const arc = (o, from, to, hidden) => {
    while (to <= from) to += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(((to - from) / Math.PI) * 2));
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const p = onOval(o, from + ((to - from) * i) / steps);
      outline.push(p);
      d += i ? ` A${sdR1(o.rx)},${sdR1(o.ry)} 0 0 1 ${sdR1(p[0])},${sdR1(p[1])}` : `M${sdR1(p[0])},${sdR1(p[1])}`;
    }
    arcs.push({ d, hidden });
  };
  const ovals = circles.map(c => oval(c.c, c.r));
  if (form.shape === 'cylinder') {
    const [lo, hi] = ovals, T = sdSub(hi.m, lo.m);
    const phi = Math.atan2(-T[0] / lo.rx, T[1] / lo.ry);   // where the sides touch the ovals
    for (const f of [phi, phi + Math.PI]) edges.push({ a: onOval(lo, f), b: onOval(hi, f), hidden: false });
    const backFirst = sdDot(sdSub(onOval(lo, phi + Math.PI / 2), lo.m), T) > 0;
    arc(lo, phi, phi + Math.PI, backFirst);
    arc(lo, phi + Math.PI, phi + 2 * Math.PI, !backFirst);
    arc(hi, 0, Math.PI, false);
    arc(hi, Math.PI, 2 * Math.PI, false);
  } else if (form.shape === 'cone') {
    const [o] = ovals, tip = at(apex), q = [(tip[0] - o.m[0]) / o.rx, (tip[1] - o.m[1]) / o.ry];
    if (sdLen(q) <= 1) { arc(o, 0, Math.PI, false); arc(o, Math.PI, 2 * Math.PI, false); }   // a cone this flat shows all of its base
    else {
      const toward = Math.atan2(q[1], q[0]), spread = Math.acos(1 / sdLen(q));
      for (const f of [toward - spread, toward + spread]) edges.push({ a: tip, b: onOval(o, f), hidden: false });
      arc(o, toward - spread, toward + spread, true);
      arc(o, toward + spread, toward - spread + 2 * Math.PI, false);
    }
    outline.push(tip);
  } else if (sphere) {
    const [o] = ovals, circle = { m: o.m, rx: o.rx, ry: o.rx };
    if (form.shape === 'sphere') { arc(circle, 0, Math.PI, false); arc(circle, Math.PI, 2 * Math.PI, false); arc(o, 0, Math.PI, false); arc(o, Math.PI, 2 * Math.PI, true); }
    else if (!spec.bowl) { arc(circle, Math.PI, 2 * Math.PI, false); arc(o, 0, Math.PI, false); arc(o, Math.PI, 2 * Math.PI, true); }
    else { arc(circle, 0, Math.PI, false); arc(o, 0, Math.PI, false); arc(o, Math.PI, 2 * Math.PI, false); }
  }

  // ---- labels
  const labels = [];
  const overlaps = (box, [cx, cy]) => labels.some(l => Math.abs(l.cx - cx) < (l.box.w + box.w) / 2 + 3 && Math.abs(l.cy - cy) < (l.box.asc + l.box.desc + box.asc + box.desc) / 2 + 2);
  const place = (part, box, center, along, slide = 0) => {
    if (!box) return;
    for (let i = 1; slide && overlaps(box, center) && i * 8 <= slide; i++) {
      const tries = [sdAdd(center, sdMul(along, i * 8)), sdAdd(center, sdMul(along, -i * 8))].filter(c => !overlaps(box, c));
      if (tries.length) center = tries[0];
    }
    labels.push({ part, box, cx: center[0], cy: center[1], x: center[0] - box.w / 2, y: center[1] + (box.asc - box.desc) / 2 });
  };
  const content = part => spec.content(part);
  const shown = part => content(part) !== null;
  const frameCenter = (() => {
    const all = outline.length ? outline : [at([0, 0, 0])];
    const ax = all.map(p => p[0]), ay = all.map(p => p[1]);
    return [(Math.min(...ax) + Math.max(...ax)) / 2, (Math.min(...ay) + Math.max(...ay)) / 2];
  })();
  /** A part's label beside the line from a to b, on the side `side` points to (away from the solid if not given). */
  const labelOn = (part, a, b, side, along = 0.5) => {
    const box = content(part);
    if (!box) return;
    const t = sdUnit(sdSub(b, a)), m = sdAdd(a, sdMul(sdSub(b, a), along));
    let n = sdPerp(t);
    if (sdDot(n, side || sdSub(m, frameCenter)) < 0) n = sdMul(n, -1);
    place(part, box, sdAdd(m, sdMul(n, 6 + sdReach(box, n))), t, 0.4 * sdLen(sdSub(b, a)));
  };
  const square = (foot, toward1, toward2) => {
    if (!spec.square) return;
    const [u1, u2] = [sdUnit(sdSub(toward1, foot)), sdUnit(sdSub(toward2, foot))];
    const q = Math.min(SD_SQUARE, 0.4 * sdLen(sdSub(toward1, foot)), 0.4 * sdLen(sdSub(toward2, foot)));
    squares.push([sdAdd(foot, sdMul(u1, q)), sdAdd(foot, sdAdd(sdMul(u1, q), sdMul(u2, q))), sdAdd(foot, sdMul(u2, q))]);
  };
  const DOWN = [0, 1], UP = [0, -1], SIDE = [dir, 0], OTHER_SIDE = [-dir, 0], n = bottomCount;

  /** A dashed height from top down to its level foot, with the lean along the base's line to it when it overhangs. */
  const dropHeight = (top, from, labelSide) => {
    const foot3 = [top[0], 0, top[2]], [tp, fp, bp] = [at(top), at(foot3), at(from)];
    const overhangs = form.oblique && Math.abs(top[0] - from[0]) > 1e-9;
    if (!spec.showHeight) return;
    extras.push({ a: fp, b: tp, dashed: true, part: 'height' });
    outline.push(fp);
    if (overhangs) { extras.push({ a: bp, b: fp, dashed: true, part: 'lean' }); square(fp, tp, bp); }
    labelOn('height', fp, tp, labelSide);
    if (overhangs) labelOn('lean', bp, fp, DOWN);
  };
  /** The bottom edge running back that the width sits on: on the depth's side, unless the lean's height and lean are there. */
  const widthEdge = () => ((dir === 1) !== (form.oblique && ld === dir) ? [pts[1], pts[2]] : [pts[0], pts[3]]);

  if (form.shape === 'prism') {
    const B = i => pts[i], T = i => pts[n + i];
    const [near, far] = dir === 1 ? [0, 1] : [1, 0];
    if (form.base === 'rectangle') { labelOn('length', B(0), B(1), DOWN); labelOn('width', ...widthEdge()); }
    else if (form.base === 'regular') {
      labelOn('side', B(0), B(1), DOWN);
      if (shown('apothem')) {
        // from the middle of the face the base is drawn on (the top, standing; the front, lying)
        const face = form.lie ? corners.slice(0, n) : corners.slice(n), c = at(sdAvg3(face));
        const e = form.lie ? sdMidV(B(0), B(1)) : sdMidV(T(0), T(1));
        extras.push({ a: c, b: e, dashed: false, part: 'apothem' }); dots.push(c);
        square(e, c, form.lie ? B(1) : T(1));
        labelOn('apothem', c, e, form.lie ? SIDE : UP);
      }
    } else {
      labelOn('triBase', B(0), B(1), DOWN);
      if (form.base === 'right') { labelOn('triHeight', B(0), B(2), form.lie ? [-1, 0] : undefined); if (form.lie) square(B(0), B(1), B(2)); }
      else if (shown('triHeight')) {
        const foot = sdMidV(B(0), B(1));
        extras.push({ a: foot, b: B(2), dashed: true, part: 'triHeight' });
        square(foot, B(2), B(1));
        labelOn('triHeight', foot, B(2), form.lie ? [-1, 0] : OTHER_SIDE);
      }
      labelOn('hyp', B(1), B(2));
    }
    if (form.lie) labelOn('height', B(far), pts[n + far]);
    else if (!form.oblique) labelOn('height', B(near), T(near), OTHER_SIDE);
    else {
      const kk = ld === 1 ? 1 : 0;   // the front corner the top leans out past
      dropHeight(corners[n + kk], corners[kk], [ld, 0]);
      // the slanted edge furthest out on the side it leans to, where its label has room
      const out = i => ld * (B(i)[0] + T(i)[0]);
      const j = Array.from({ length: n }, (_, i) => i).reduce((best, i) => (out(i) > out(best) + 1e-6 ? i : best), 0);
      if (j === kk) labelOn('edge', B(j), T(j), [-ld, 0]);
      else labelOn('edge', B(j), T(j), [ld, 0], 0.72);
    }
  } else if (form.shape === 'pyramid') {
    const B = i => pts[i];
    if (form.base === 'rectangle') { labelOn('length', B(0), B(1), DOWN); labelOn('width', ...widthEdge()); }
    else labelOn('side', B(0), B(1), DOWN);
    const c3 = sdAvg3(corners.slice(0, n)), c = at(c3), frontMid = sdMidV(B(0), B(1));
    if (shown('apothem')) { extras.push({ a: c, b: frontMid, dashed: true, part: 'apothem' }); square(frontMid, c, B(1)); labelOn('apothem', c, frontMid, OTHER_SIDE); }
    if (!form.oblique) {
      if (spec.showHeight) { extras.push({ a: c, b: pts[n], dashed: true, part: 'height' }); square(c, pts[n], frontMid); labelOn('height', c, pts[n], OTHER_SIDE); }
      if (shown('slant')) { extras.push({ a: frontMid, b: pts[n], dashed: true, part: 'slant' }); square(frontMid, pts[n], B(1)); labelOn('slant', frontMid, pts[n], SIDE); }
    } else dropHeight(apex, c3, [ld, 0]);
  } else {
    // the radius (or diameter): across the top of a cylinder, the base of a cone or hemisphere, the middle of a sphere
    const o = form.shape === 'cylinder' ? ovals[1] : ovals[0];
    const toward = form.oblique ? -ld : 1;   // away from the lean, which runs out along the same line
    const rim = [o.m[0] + toward * o.rx, o.m[1]];
    const start = spec.diameter ? [o.m[0] - toward * o.rx, o.m[1]] : o.m;
    if (shown('radius')) {
      extras.push({ a: start, b: rim, dashed: form.shape === 'cone', part: 'radius' });
      if (!spec.diameter) dots.push(o.m);
      labelOn('radius', start, rim, form.shape === 'cone' && !form.oblique ? DOWN : UP);
    }
    if (form.shape === 'cylinder') {
      const [lo, hi] = ovals;
      if (!form.oblique) labelOn('height', [lo.m[0] + lo.rx, lo.m[1]], [hi.m[0] + hi.rx, hi.m[1]], [1, 0]);
      else {
        dropHeight(circles[1].c, circles[0].c, [ld, 0]);
        const [e1, e2] = edges, outer = ld * (e1.a[0] + e1.b[0]) > ld * (e2.a[0] + e2.b[0]) ? e1 : e2;
        labelOn('edge', outer.a, outer.b, [ld, 0]);
      }
    } else if (form.shape === 'cone') {
      const tip = at(apex);
      if (!form.oblique) {
        if (spec.showHeight) { extras.push({ a: o.m, b: tip, dashed: true, part: 'height' }); square(o.m, tip, rim); labelOn('height', o.m, tip, [-1, 0]); }
        const right = edges.reduce((best, e) => (e.b[0] > best.b[0] ? e : best), edges[0]);
        if (right) labelOn('slant', right.b, right.a, [1, 0]);
      } else dropHeight(apex, [0, 0, 0], [ld, 0]);
    }
  }

  // corner names: outward from the middle of the solid
  if (spec.names && !round) {
    corners.forEach((_, i) => {
      const nm = spec.names[i] === undefined || spec.names[i] === null ? sdLetter(i) : spec.names[i];
      const box = nm === '' ? null : mathBox(nm, (spec.nameSize || 21) * k, { lang: spec.lang });
      if (!box) return;
      let out = sdUnit(sdSub(pts[i], frameCenter));
      if (!sdLen(out)) out = UP;
      place(`v${sdLetter(i)}`, box, sdAdd(pts[i], sdMul(out, 7 + sdReach(box, out))), sdPerp(out));
    });
  }

  // the frame holds the solid, its lines and every label
  const all = [...outline, ...extras.flatMap(e => [e.a, e.b])];
  for (const l of labels) all.push([l.cx - l.box.w / 2, l.y - l.box.asc], [l.cx + l.box.w / 2, l.y + l.box.desc]);
  const minX = Math.min(...all.map(p => p[0])) - SD_PAD, minY = Math.min(...all.map(p => p[1])) - SD_PAD;
  const maxX = Math.max(...all.map(p => p[0])) + SD_PAD, maxY = Math.max(...all.map(p => p[1])) + SD_PAD;
  return {
    frame: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    edges: edges.filter(e => spec.hidden || !e.hidden), arcs: arcs.filter(a => spec.hidden || !a.hidden), extras, squares, dots, labels, scale,
  };
}
