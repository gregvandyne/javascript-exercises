// Oomba Figures: how a measured shape is laid out. Any polygon (a triangle, a quadrilateral, a regular polygon) is
// turned, flipped and scaled to fit the same box whatever its measures, then marked: an arc at an angle (or two or three
// for equal angles), a square at a right angle, ticks across equal sides, arrows on parallel sides, heights from a corner
// to the line through a side (the side runs on, dashed, when the height lands outside the shape), diagonals, lines out
// from the center (a regular polygon's radius and apothem), and every label put down clear of the lines and of the
// labels before it. The figure's frame then grows to hold its labels. Pure numbers in, pure numbers out: the drawing is
// figures/src/shapes.js.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; labels are laid out by Oomba's own math label typesetter (mathtext.js)
// from structured labels, not typed math read by a math input library; the right-angle squares go where the caller says
// (the true angles), while marks and label spots follow the drawn corners, so a figure drawn "not to scale" keeps its
// marks honest; the values written at heights, diagonals and spokes come from the caller (the true measures), not from
// the drawing; the label dragging (moved labels kept in the page address) and the label-size setting are left out (a
// scale factor instead); the frame is returned as an offset and a size for the caller's <svg>.
import { mathBox } from '../mathtext.js';

const SH_FS = 20;          // label font size, at scale 1
const SH_NAME_FS = 21;     // a corner's name
const SH_FIT_W = 440;      // the box every shape is scaled to fit
const SH_FIT_H = 320;
const SH_PAD = 12;
const SH_ARC = 24;         // angle arc radius
const SH_ARC_GAP = 4.5;    // between two arcs at one angle
const SH_SQUARE = 14;      // right-angle square
const SH_TICK = 7;         // half a tick's length
const SH_TICK_GAP = 5;
const SH_ARROW = 4.5;      // half a parallel arrow's length, and
const SH_ARROW_W = 5;      // half its width
const SH_ARROW_GAP = 6;
const SH_RAD = Math.PI / 180;

const shAdd = (p, q) => [p[0] + q[0], p[1] + q[1]];
const shSub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const shMul = (p, k) => [p[0] * k, p[1] * k];
const shDot = (p, q) => p[0] * q[0] + p[1] * q[1];
const shCross = (p, q) => p[0] * q[1] - p[1] * q[0];
const shLen = p => Math.hypot(p[0], p[1]);
const shUnit = p => shMul(p, 1 / (shLen(p) || 1));
const shPerp = p => [-p[1], p[0]];
const shR1 = v => Math.round(v * 10) / 10;
/** How far a label's box reaches from its middle in direction d. */
const shReach = (box, d) => (box.w / 2) * Math.abs(d[0]) + ((box.asc + box.desc) / 2) * Math.abs(d[1]);
const shBetween = (p, q) => Math.acos(Math.max(-1, Math.min(1, shDot(p, q))));

/** The sides of a shape, as [side id, from corner, to corner], in order around it. */
export function sidesOf(ids) {
  return ids.map((id, i) => [`${id}${ids[(i + 1) % ids.length]}`, id, ids[(i + 1) % ids.length]]);
}

/**
 * spec: { corners: [{ id, name (a label or ''), at: [x, y] (y up) }] in order around the shape, angles: { id: degrees },
 * sides: { AB: length } (the true measures, for what is written), sized (false: no lengths are written), labels: { part:
 * { mode: 'measure' | 'text', text, typed } }, arcs, ticks, arrows: { part: count }, right: [corner ids with a square],
 * heights: [{ id, from, onto: [a, b], style, label, value, foot, square }], diagonals: [{ id, ends, style, label, value }],
 * cross (a label), center: { at, dot, name }, spokes: [{ id, to: corner | [a, b], style, label, value }], unit, round,
 * flip, rotate, scale, lang }. -> { frame: { x, y, w, h }, corners, arcs, squares, ticks, arrows, lines, extensions,
 * dots, labels: [{ part, box, cx, cy, x, y }], scale }.
 */
export function layoutShape(spec) {
  const k = spec.scale || 1, FS = SH_FS * k, NAME_FS = SH_NAME_FS * k, lang = spec.lang || 'en';
  const ids = spec.corners.map(c => c.id), n = ids.length, right = new Set(spec.right || []);

  // flipped and turned, then in SVG's y-down coordinates, scaled to fit
  const pts = {}, turn = (spec.rotate || 0) * SH_RAD;
  const turned = at => { let [x, y] = at; if (spec.flip) x = -x; return [x * Math.cos(turn) - y * Math.sin(turn), -(x * Math.sin(turn) + y * Math.cos(turn))]; };
  for (const c of spec.corners) pts[c.id] = turned(c.at);
  const xs = ids.map(v => pts[v][0]), ys = ids.map(v => pts[v][1]);
  const scale = Math.min(SH_FIT_W / (Math.max(...xs) - Math.min(...xs) || 1), SH_FIT_H / (Math.max(...ys) - Math.min(...ys) || 1));
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const fitted = ([x, y]) => [(x - x0) * scale, (y - y0) * scale];
  for (const v of ids) pts[v] = fitted(pts[v]);
  const center = spec.center ? fitted(turned(spec.center.at)) : null;
  const middle = shMul(ids.reduce((m, v) => shAdd(m, pts[v]), [0, 0]), 1 / n);

  const labels = [];
  const overlaps = (box, [cx, cy]) => labels.some(l => Math.abs(l.cx - cx) < (l.box.w + box.w) / 2 + 3 && Math.abs(l.cy - cy) < (l.box.asc + l.box.desc + box.asc + box.desc) / 2 + 2);
  // slide: how far the label may move along its part to clear the labels already placed
  const place = (part, box, at, along, slide = 0) => {
    if (!box) return;
    for (let i = 1; slide && overlaps(box, at) && i * 8 <= slide; i++) {
      const tries = [shAdd(at, shMul(along, i * 8)), shAdd(at, shMul(along, -i * 8))].filter(c => !overlaps(box, c));
      if (tries.length) at = tries[0];
    }
    labels.push({ part, box, cx: at[0], cy: at[1], x: at[0] - box.w / 2, y: at[1] + (box.asc - box.desc) / 2 });
  };

  const unitText = spec.unit ? ` ${spec.unit}` : '';
  const rounded = v => Number(v.toFixed(spec.round ?? 1));
  /** What is written at a side or angle, laid out, or null for nothing. */
  const content = (key, value, isAngle) => {
    const l = spec.labels[key];
    if (!l) return null;
    if (l.mode === 'text') return mathBox(l.text, FS, { lang });
    if (!isAngle && !spec.sized) return null;
    return mathBox(l.typed ?? rounded(value), FS, { lang, suffix: isAngle ? '°' : unitText });
  };
  /** What is written at an extra line whose true length is value. */
  const lineContent = (l, value) => {
    if (!l) return null;
    if (l.mode === 'text') return mathBox(l.text, FS, { lang });
    return spec.sized ? mathBox(l.typed ?? rounded(value), FS, { lang, suffix: unitText }) : null;
  };
  const nameBox = name => (name === '' || name === null || name === undefined ? null : mathBox(name, NAME_FS, { lang }));
  const foot = (from, [a, b]) => {
    const dir = shSub(pts[b], pts[a]), t = shDot(shSub(from, pts[a]), dir) / shDot(dir, dir);
    return { t, at: shAdd(pts[a], shMul(dir, t)) };
  };

  // angles: an arc (or two or three) when labeled or marked, a square at a right angle
  const arcs = [], squares = [];
  ids.forEach((v, i) => {
    const [a, b] = [ids[(i + n - 1) % n], ids[(i + 1) % n]].sort((p, q) => ids.indexOf(p) - ids.indexOf(q));
    const u1 = shUnit(shSub(pts[a], pts[v])), u2 = shUnit(shSub(pts[b], pts[v])), bis = shUnit(shAdd(u1, u2));
    const room = 0.4 * Math.min(shLen(shSub(pts[a], pts[v])), shLen(shSub(pts[b], pts[v])));
    const box = content(v, spec.angles[v], true), count = (spec.arcs || {})[v] || 0;
    let outer = 0;
    if (right.has(v)) {
      const q = Math.min(SH_SQUARE, room);
      squares.push([shAdd(pts[v], shMul(u1, q)), shAdd(pts[v], shAdd(shMul(u1, q), shMul(u2, q))), shAdd(pts[v], shMul(u2, q))]);
      outer = q * Math.SQRT2;
    } else if (box || count) {
      const r0 = Math.min(SH_ARC, room), sweep = u1[0] * u2[1] - u1[1] * u2[0] > 0 ? 1 : 0;
      for (let j = 0; j < Math.max(1, count); j++) {
        const r = r0 + j * SH_ARC_GAP, p = shAdd(pts[v], shMul(u1, r)), q = shAdd(pts[v], shMul(u2, r));
        arcs.push(`M${shR1(p[0])},${shR1(p[1])} A${shR1(r)},${shR1(r)} 0 0 ${sweep} ${shR1(q[0])},${shR1(q[1])}`);
      }
      outer = r0 + (Math.max(1, count) - 1) * SH_ARC_GAP;
    }
    if (box) {
      // between the two sides, or, when extra lines from this corner split the angle, in the widest part of it, so no
      // line runs through the label
      let e1 = u1, e2 = u2, spread = shBetween(u1, u2);
      const whole = spread;
      const rays = [
        ...(spec.heights || []).filter(h => h.from === v).map(h => shUnit(shSub(foot(pts[v], h.onto).at, pts[v]))),
        ...(spec.diagonals || []).filter(d => d.ends.includes(v)).map(d => shUnit(shSub(pts[d.ends[0] === v ? d.ends[1] : d.ends[0]], pts[v]))),
      ].filter(r => { const w1 = shBetween(u1, r), w2 = shBetween(u2, r); return Math.abs(w1 + w2 - whole) < 1e-6 && Math.min(w1, w2) > 1e-3; })
        .sort((p, q) => shBetween(u1, p) - shBetween(u1, q));
      const edges = [u1, ...rays, u2];
      for (let j = 0; rays.length && j < edges.length - 1; j++) {
        const gap = shBetween(edges[j], edges[j + 1]);
        if (j === 0 || gap >= spread) [e1, e2, spread] = [edges[j], edges[j + 1], gap];
      }
      const mid = shUnit(shAdd(e1, e2));
      // far enough in to clear the arc, and to fit between its two edges
      const half = Math.sin(spread / 2), toSide = Math.max(...[e1, e2].map(u => (shReach(box, shPerp(u)) + 3) / half));
      place(v, box, shAdd(pts[v], shMul(mid, Math.max(outer + 5 + shReach(box, mid), toSide))), mid);
    }
    const nb = nameBox(spec.corners[i].name);
    if (nb) { const out = shMul(bis, -1); place(`v${v}`, nb, shAdd(pts[v], shMul(out, 7 + shReach(nb, out))), shPerp(out)); }
  });

  // sides: ticks and parallel arrows across the middle, the label just outside it
  const ticks = [], arrows = [];
  for (const [side, from, to] of sidesOf(ids)) {
    const p = pts[from], q = pts[to], mid = shMul(shAdd(p, q), 0.5), t = shUnit(shSub(q, p));
    let nrm = shPerp(t);
    if (shDot(nrm, shSub(middle, mid)) > 0) nrm = shMul(nrm, -1);
    const count = (spec.ticks || {})[side] || 0, arrowCount = (spec.arrows || {})[side] || 0;
    // ticks and arrows on one side sit apart, arrows toward the side's far end
    const both = count && arrowCount;
    const tickMid = both ? shAdd(mid, shMul(t, -(count * SH_TICK_GAP) / 2 - 4)) : mid;
    const arrowMid = both ? shAdd(mid, shMul(t, (arrowCount * SH_ARROW_GAP) / 2 + 4)) : mid;
    for (let j = 0; j < count; j++) {
      const c = shAdd(tickMid, shMul(t, (j - (count - 1) / 2) * SH_TICK_GAP));
      ticks.push([shAdd(c, shMul(nrm, SH_TICK)), shAdd(c, shMul(nrm, -SH_TICK))]);
    }
    // every arrow points rightward on the page (or down, on an upright side), so arrows on parallel sides agree
    const way = t[0] > 1e-9 || (Math.abs(t[0]) <= 1e-9 && t[1] > 0) ? t : shMul(t, -1);
    for (let j = 0; j < arrowCount; j++) {
      const c = shAdd(arrowMid, shMul(way, (j - (arrowCount - 1) / 2) * SH_ARROW_GAP)), tip = shAdd(c, shMul(way, SH_ARROW)), back = shAdd(c, shMul(way, -SH_ARROW));
      arrows.push([shAdd(back, shMul(nrm, SH_ARROW_W)), tip, shAdd(back, shMul(nrm, -SH_ARROW_W))]);
    }
    const box = content(side, spec.sides[side], false);
    if (box) place(side, box, shAdd(mid, shMul(nrm, (count || arrowCount ? SH_TICK + 6 : 6) + shReach(box, nrm))), t);
  }

  // heights: from a corner straight to the line through a side, which runs on (dashed) when the foot is outside the shape
  const lines = [], extensions = [];
  for (const h of spec.heights || []) {
    const v = h.from, [a, b] = h.onto, { t, at: ft } = foot(pts[v], h.onto), up = shUnit(shSub(pts[v], ft));
    const onCorner = Math.abs(t) < 1e-6 || Math.abs(t - 1) < 1e-6;   // the height is a side
    let along = shUnit(t < 0.5 ? shSub(pts[b], ft) : shSub(pts[a], ft));
    if (t < 0) along = shUnit(shSub(pts[a], ft));
    if (t > 1) along = shUnit(shSub(pts[b], ft));
    if (!onCorner) {
      // drawn out from the foot, so the dashes start whole at the right angle there
      lines.push({ part: h.id, from: ft, to: pts[v], style: h.style });
      if (t < 0) extensions.push([ft, pts[a]]);
      if (t > 1) extensions.push([ft, pts[b]]);
      if (h.square !== false) { const q = Math.min(12, shLen(shSub(pts[v], ft)) * 0.4); squares.push([shAdd(ft, shMul(along, q)), shAdd(ft, shAdd(shMul(along, q), shMul(up, q))), shAdd(ft, shMul(up, q))]); }
    }
    const box = lineContent(h.label, h.value);
    if (box) {
      // away from whichever side from this corner runs closest to the height, or the other way when that is crowded
      const down = shMul(up, -1);
      const [near] = [pts[a], pts[b]].map(e => shUnit(shSub(e, pts[v]))).sort((p, q) => shDot(q, down) - shDot(p, down));
      let across = shPerp(up);
      if (shDot(across, near) > 0) across = shMul(across, -1);
      const spot = d => shAdd(shMul(shAdd(pts[v], ft), 0.5), shMul(d, 6 + shReach(box, d)));
      const other = spot(shMul(across, -1)), rel = shSub(other, pts[v]);
      const fits = Math.abs(rel[0] * near[1] - rel[1] * near[0]) > shReach(box, shPerp(near)) + 3;
      if (fits && overlaps(box, spot(across)) && !overlaps(box, other)) across = shMul(across, -1);
      place(h.id, box, spot(across), up, 0.4 * shLen(shSub(pts[v], ft)));
    }
    const fb = nameBox(h.foot);
    if (fb) { const down = shMul(up, -1); place(`f${v}`, fb, shAdd(ft, shMul(down, 7 + shReach(fb, down))), shPerp(down)); }
  }

  // diagonals: corner to corner; with both drawn, each label sits half way from its first corner to where they cross
  const diagonals = spec.diagonals || [];
  let crossing = null;
  if (diagonals.length === 2) {
    const [[p1, q1], [p2, q2]] = diagonals.map(d => d.ends.map(e => pts[e]));
    const d1 = shSub(q1, p1), d2 = shSub(q2, p2), c = shCross(d1, d2);
    if (Math.abs(c) > 1e-9) crossing = shAdd(p1, shMul(d1, shCross(shSub(p2, p1), d2) / c));
  }
  for (const d of diagonals) {
    const p = pts[d.ends[0]], q = pts[d.ends[1]];
    lines.push({ part: d.id, from: p, to: q, style: d.style });
    const box = lineContent(d.label, d.value);
    if (!box) continue;
    const t = shUnit(shSub(q, p));
    let across = shPerp(t);
    if (across[1] > 0) across = shMul(across, -1);   // above the line reads best
    const spot = shMul(shAdd(p, crossing || q), 0.5);
    place(d.id, box, shAdd(spot, shMul(across, 6 + shReach(box, across))), t, 0.4 * shLen(shSub(crossing || q, p)));
  }
  if (crossing) {
    // rays from the crossing to all four corners; a square between the first corners of the two diagonals when they
    // cross at right angles (and the caller says so), the name in the widest gap left
    const rays = diagonals.flatMap(d => d.ends.map(e => shUnit(shSub(pts[e], crossing))));
    const [a1, , a2] = rays, sq = spec.crossSquare === true;
    if (sq) {
      const q = Math.min(12, 0.3 * Math.min(...diagonals.flatMap(d => d.ends.map(e => shLen(shSub(pts[e], crossing))))));
      squares.push([shAdd(crossing, shMul(a1, q)), shAdd(crossing, shAdd(shMul(a1, q), shMul(a2, q))), shAdd(crossing, shMul(a2, q))]);
    }
    const box = nameBox(spec.cross);
    if (box) {
      const angleOf = u => Math.atan2(u[1], u[0]), sorted = [...rays].sort((u, w) => angleOf(u) - angleOf(w));
      let best = null;
      sorted.forEach((u, i) => {
        const w = sorted[(i + 1) % 4], gap = (angleOf(w) - angleOf(u) + 2 * Math.PI) % (2 * Math.PI);
        const squared = sq && ((u === a1 && w === a2) || (u === a2 && w === a1));
        if (!squared && (!best || gap > best.gap + 1e-9)) best = { gap, dir: shUnit(shAdd(u, w)) };
      });
      place('x', box, shAdd(crossing, shMul(best.dir, 8 + shReach(box, best.dir))), shPerp(best.dir));
    }
  }

  // lines out from the center: each label beside its line's middle, on the side away from the other lines' ends
  const dots = [];
  if (center) {
    const spokes = spec.spokes || [];
    const ends = spokes.map(sp => (typeof sp.to === 'string' ? pts[sp.to] : shMul(shAdd(pts[sp.to[0]], pts[sp.to[1]]), 0.5)));
    spokes.forEach((sp, i) => {
      const end = ends[i];
      lines.push({ part: sp.id, from: center, to: end, style: sp.style });
      if (typeof sp.to !== 'string' && sp.square !== false) {
        const q = Math.min(12, 0.4 * shLen(shSub(end, center))), along = shUnit(shSub(pts[sp.to[1]], end)), up = shUnit(shSub(center, end));
        squares.push([shAdd(end, shMul(along, q)), shAdd(end, shAdd(shMul(along, q), shMul(up, q))), shAdd(end, shMul(up, q))]);
      }
      const box = lineContent(sp.label, sp.value);
      if (!box) return;
      const t = shUnit(shSub(end, center));
      let across = shPerp(t);
      const others = ends.filter((_, j) => j !== i);
      if (others.length) {
        const away = shSub(shMul(shAdd(center, end), 0.5), shMul(others.reduce((m, e) => shAdd(m, e), [0, 0]), 1 / others.length));
        if (shDot(across, away) < 0) across = shMul(across, -1);
      } else if (across[1] > 0) across = shMul(across, -1);
      place(sp.id, box, shAdd(shMul(shAdd(center, end), 0.5), shMul(across, 6 + shReach(box, across))), t, 0.4 * shLen(shSub(end, center)));
    });
    if (spec.center.dot) dots.push(center);
    // the center's name in the widest gap between its lines, or just below it
    const box = nameBox(spec.center.name);
    if (box) {
      const angleOf = u => Math.atan2(u[1], u[0]), rays = ends.map(e => shUnit(shSub(e, center))).sort((u, w) => angleOf(u) - angleOf(w));
      let dir = [0, 1], widest = -1;
      rays.forEach((u, i) => {
        const w = rays[(i + 1) % rays.length], gap = rays.length === 1 ? 2 * Math.PI : (angleOf(w) - angleOf(u) + 2 * Math.PI) % (2 * Math.PI);
        const mid = rays.length === 1 ? shMul(u, -1) : shMul(shAdd(u, w), gap > Math.PI ? -1 : 1);
        if (gap > widest + 1e-9) [widest, dir] = [gap, shLen(mid) < 1e-6 ? shPerp(u) : shUnit(mid)];
      });
      place('o', box, shAdd(center, shMul(dir, 7 + shReach(box, dir))), shPerp(dir));
    }
  }

  // the frame holds the shape, its extensions and every label
  const all = [...ids.map(v => pts[v]), ...extensions.flat()];
  for (const l of labels) all.push([l.cx - l.box.w / 2, l.y - l.box.asc], [l.cx + l.box.w / 2, l.y + l.box.desc]);
  const minX = Math.min(...all.map(p => p[0])) - SH_PAD, minY = Math.min(...all.map(p => p[1])) - SH_PAD;
  const maxX = Math.max(...all.map(p => p[0])) + SH_PAD, maxY = Math.max(...all.map(p => p[1])) + SH_PAD;
  return { frame: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, corners: ids.map(v => pts[v]), ids, arcs, squares, ticks, arrows, lines, extensions, dots, labels, scale };
}
