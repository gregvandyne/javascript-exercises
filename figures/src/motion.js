// Oomba Figures: motion graphs and motion maps (the physics pack). Distance, displacement or velocity against time from
// points, with the area under a velocity-time graph; and since 1.1.0 a motion given as segments (at rest, constant
// velocity, speeding up, slowing down: ported/motion.js), drawn as one graph (position, velocity or acceleration
// against time) or the three stacked on one time axis, and as a motion map (a dot every equal time step, with velocity
// arrows on one scale). All of them come from the same numbers, so they always agree; drawn on the core's axes
// (graphs.js): a gradient is a gradient and an area is an area.
import { node, label, line, poly, arrow, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { axes, axisTitle, niceStep } from './graphs.js';
import { MO_KINDS, moMotion, moPositionAt, moVelocityAt, moLetter } from './ported/motion.js';

// ---------------------------------------------------------------- motion graphs
const MOTION = { 'distance-time': 'distance', 'displacement-time': 'displacement', 'velocity-time': 'velocity' };
/**
 * { type: 'distance-time' | 'displacement-time' | 'velocity-time', points: [[t, y], ...] (joined by straight lines; t
 * goes up), tmax?, ymin?, ymax?, xstep?, ystep?, tunit?: 's', yunit?: 'm' | 'm/s', xlabel?, ylabel?, shade?: true (the
 * area under a velocity-time graph: the distance), marks?: [index, ...] (letters A, B, C at those points) }. hide: the
 * axes and grid only, for plotting (or 'line': the same; 'area': no shading).
 */
export const motionGraph = {
  check(d) {
    if (d && (d.segments !== undefined || d.graphs !== undefined || SEG_ONLY.includes(d.type))) return mgSegCheck(d);
    const out = [];
    if (!d || !MOTION[d.type]) out.push(`"type" must be one of ${Object.keys(MOTION).join(', ')}`);
    const pts = d && Array.isArray(d.points) ? d.points : null;
    if (!pts || pts.length < 2 || pts.length > 20 || pts.some(q => !Array.isArray(q) || !isNum(q[0], 0, 1e6) || !isNum(q[1], -1e6, 1e6))) out.push('"points" must list 2 to 20 points [t, value] with t 0 or more');
    else if (pts.some((q, i) => i && q[0] <= pts[i - 1][0])) out.push('the times in "points" must go up');
    else if (d.type === 'distance-time' && pts.some((q, i) => q[1] < 0 || (i && q[1] < pts[i - 1][1] - 1e-9))) out.push('a distance-time graph never goes down (and never below 0): use displacement-time for coming back');
    return out;
  },
  /** The area under the line from t = a to t = b (a velocity-time graph: the distance travelled, by the trapezium rule,
   *  exact for straight pieces). */
  area(d, a = d.points[0][0], b = d.points[d.points.length - 1][0]) {
    let s = 0;
    for (let i = 1; i < d.points.length; i++) {
      const [t0, v0] = d.points[i - 1], [t1, v1] = d.points[i], lo = Math.max(a, t0), hi = Math.min(b, t1);
      if (hi <= lo) continue;
      const at = t => v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
      s += ((at(lo) + at(hi)) / 2) * (hi - lo);
    }
    return s;
  },
  /** From segments (1.1.0): the motion piece by piece, where it ends, how far it went, and its velocity and acceleration
   *  at each boundary (A, B, C...). From points: the area under the line (as OF.solve.motionArea). */
  solve(d) {
    if (motionGraph.check(d).length) return null;
    if (d.segments !== undefined) return moSolve(d);
    return { area: motionGraph.area(d) };
  },
  draw(d, o) {
    if (d.segments !== undefined) return mgSegDraw(d, o);
    const P = palette(o), W = figWords(o.lang), pts = d.points;
    const tmax = isNum(d.tmax) ? d.tmax : pts[pts.length - 1][0], vals = pts.map(q => q[1]);
    const ymax = isNum(d.ymax) ? d.ymax : Math.max(...vals) * 1.15 || 1, ymin = isNum(d.ymin) ? d.ymin : Math.min(0, ...vals) * 1.15;
    const A = axes([0, tmax], [ymin, ymax], o, { xstep: d.xstep, ystep: d.ystep, xlabel: text(d.xlabel, 40) || axisTitle(W('time'), text(d.tunit, 8) || 's'),
      ylabel: text(d.ylabel, 40) || axisTitle(W(MOTION[d.type]), text(d.yunit, 8) || (d.type === 'velocity-time' ? 'm/s' : 'm')), origin: ymin < 0 });
    const kids = [...A.kids], blank = o.hide === true || hides(o, 'line');
    if (!blank) {
      if (d.shade && d.type === 'velocity-time' && !hides(o, 'area')) kids.push(node('polygon', { points: [[pts[0][0], 0], ...pts, [pts[pts.length - 1][0], 0]].map(q => `${r2(A.X(q[0]))},${r2(A.Y(q[1]))}`).join(' '), fill: P.fill, 'fill-opacity': 0.85, stroke: 'none' }));
      kids.push(poly(pts.map(q => [A.X(q[0]), A.Y(q[1])]), { stroke: P.green, 'stroke-width': 3.5 }));
      (Array.isArray(d.marks) ? d.marks : []).forEach((i, k) => { const q = pts[i]; if (q) kids.push(node('circle', { cx: A.X(q[0]), cy: A.Y(q[1]), r: 4.5, fill: P.ink }), label(A.X(q[0]) + 6, A.Y(q[1]) - 13, String.fromCharCode(65 + k), { size: 14, colour: P.ink, halo: P.paper })); });
    }
    return frame(A.w, A.h, kids, { ...o, kind: 'motionGraph' }, o.title || 'Motion graph');
  },
};

// ---------------------------------------------------------------- from segments (1.1.0)
// { segments: [{ kind: "rest" | "forward" | "back" | "faster" | "slower", speed (m/s; not for rest), duration (s), dir?:
// "back" (speeding up from rest, backward) }], start?: position at t = 0 (m) }, shared by motionGraph and motionMap.
const SEG_ONLY = ['acceleration-time', 'position-time'];
const SEG_GRAPHS = { position: 'position', velocity: 'velocity', acceleration: 'acceleration' };
const SEG_TYPE = { 'position-time': 'position', 'displacement-time': 'position', 'distance-time': 'position', 'velocity-time': 'velocity', 'acceleration-time': 'acceleration' };
const SEG_KEYS_GRAPH = ['kind', 'hide', 'type', 'segments', 'start', 'graphs', 'marks', 'shade', 'tunit', 'xunit', 'heading'];
function moCheckSegments(d, out) {
  const segs = d && Array.isArray(d.segments) ? d.segments : null;
  if (!segs || !segs.length || segs.length > 8) { out.push('"segments" must list 1 to 8 parts of the motion: { kind: "rest" | "forward" | "back" | "faster" | "slower", speed, duration }'); return null; }
  segs.forEach((g, i) => {
    const at = `segment ${i + 1}`;
    if (!g || typeof g !== 'object' || !MO_KINDS.includes(g.kind)) out.push(`${at}: "kind" must be one of ${MO_KINDS.join(', ')}`);
    else {
      if (g.kind !== 'rest' && !isNum(g.speed, g.kind === 'slower' ? 0 : 1e-6, 1000)) out.push(`${at}: "speed" must be the speed in m/s it ${g.kind === 'faster' ? 'speeds up to' : g.kind === 'slower' ? 'slows down to (0 to stop)' : 'moves at'}, ${g.kind === 'slower' ? '0' : 'above 0'} to 1000`);
      if (g.kind === 'rest' && g.speed !== undefined && g.speed !== 0) out.push(`${at}: at rest has no speed`);
      if (g.dir !== undefined && !['forward', 'back'].includes(g.dir)) out.push(`${at}: "dir" must be "forward" or "back"`);
      if (g.dir !== undefined && g.kind !== 'faster') out.push(`${at}: "dir" is only for speeding up from rest (constant velocity is "forward" or "back")`);
    }
    if (!g || !isNum(g.duration, 0.1, 1000)) out.push(`${at}: "duration" must be the time it lasts, 0.1 to 1000 s`);
  });
  if (d.start !== undefined && !isNum(d.start, -1e5, 1e5)) out.push('"start" must be the position at t = 0, in m');
  if (out.length) return null;
  const m = moMotion(segs, d.start || 0);
  for (const i of m.unreached) {
    const v = Math.abs(i ? m.pieces[i - 1].v1 : 0), g = segs[i];
    out.push(g.kind === 'faster' ? `segment ${i + 1} speeds up to ${fmt(g.speed)} m/s, but it is already moving at ${fmt(v)} m/s: give a faster speed (or "forward")` : `segment ${i + 1} slows down to ${fmt(g.speed)} m/s, but it is moving at only ${fmt(v)} m/s: give a slower speed (0 to stop)`);
  }
  for (const [i, g] of segs.entries()) if (g.kind === 'faster' && g.dir !== undefined && i && Math.abs(m.pieces[i - 1].v1) > 1e-12) out.push(`segment ${i + 1}: "dir" is only for speeding up from rest (once moving it keeps going the way it was)`);
  return out.length ? null : m;
}
function mgSegCheck(d) {
  const out = [];
  if (d.segments === undefined) return [`${d.graphs !== undefined ? 'stacked graphs ("graphs")' : `an ${d.type} graph`} ${d.graphs !== undefined ? 'are' : 'is'} drawn from "segments" (the motion part by part: { kind, speed, duration }), not "points"`];
  if (d.points !== undefined) out.push('give "points" or "segments", not both');
  if (d.type !== undefined && !SEG_TYPE[d.type]) out.push(`with "segments", "type" must be one of ${Object.keys(SEG_TYPE).join(', ')}`);
  if (d.graphs !== undefined && (!Array.isArray(d.graphs) || !d.graphs.length || d.graphs.length > 3 || d.graphs.some((g, i) => !SEG_GRAPHS[g] || d.graphs.indexOf(g) !== i))) out.push('"graphs" lists one to three of "position", "velocity", "acceleration" (stacked on one time axis, in that order)');
  if (d.graphs !== undefined && d.type !== undefined) out.push('give "type" (one graph) or "graphs" (stacked), not both');
  if (d.type === undefined && d.graphs === undefined) out.push('say which graph: "type" (one) or "graphs" (stacked)');
  if (d.marks !== undefined && typeof d.marks !== 'boolean') out.push('"marks" is true (letters A, B, C at each segment\'s ends) or false');
  for (const k of Object.keys(d)) if (!SEG_KEYS_GRAPH.includes(k) && k !== 'points') out.push(`with "segments", "${k}" is not used (the motion's numbers decide the axes)`);
  const m = moCheckSegments(d, out);
  if (m && d.type === 'distance-time' && (m.pieces.some(p => p.v0 < 0 || p.v1 < 0) || (d.start || 0) < 0)) out.push('a distance-time graph never goes down: this motion goes back, so draw it as "position-time"');
  return out;
}
/** The numbers behind a motion: each piece, where it ends, the displacement and the distance, and at each boundary
 *  (A, B, C...) its time, position, velocity before and after, and the acceleration after. */
function moSolve(d) {
  const m = moMotion(d.segments, d.start || 0), P = m.pieces, last = P[P.length - 1];
  return {
    pieces: P.map((p, i) => ({ from: moLetter(i), to: moLetter(i + 1), t0: p.t0, t1: p.t1, v0: p.v0, v1: p.v1, x0: p.x0, x1: p.x1, a: p.a, displacement: p.x1 - p.x0, distance: moDistance(p) })),
    end: m.end, start: d.start || 0, finish: last.x1, displacement: last.x1 - (d.start || 0), distance: P.reduce((s, p) => s + moDistance(p), 0),
    points: [...P.map((p, i) => ({ letter: moLetter(i), t: p.t0, x: p.x0, vBefore: i ? P[i - 1].v1 : p.v0, vAfter: p.v0, a: p.a })), { letter: moLetter(P.length), t: m.end, x: last.x1, vBefore: last.v1, vAfter: last.v1, a: last.a }],
    at: t => ({ x: moPositionAt(m, t), v: moVelocityAt(m, t) }),
  };
}
const moDistance = p => (p.v0 * p.v1 >= 0 ? Math.abs(p.x1 - p.x0) : (p.v0 * p.v0 + p.v1 * p.v1) / (2 * Math.abs(p.a)));
function moRange(lo, hi) {
  if (hi - lo < 1e-9) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); if (hi - lo < 1e-9) hi = lo + 1; }
  const st = niceStep(hi - lo, 5), a = Math.floor(lo / st + 1e-9) * st, b = Math.ceil(hi / st - 1e-9) * st;
  return { from: Math.min(a, 0), to: Math.max(b, 0), step: st };
}
/** One graph's line: a list of polylines [[t, value], ...] (a velocity or acceleration jump starts a new one). */
function moLines(m, view) {
  const out = [];
  for (const p of m.pieces) {
    if (view === 'acceleration') out.push([[p.t0, p.a], [p.t1, p.a]]);
    else if (view === 'velocity') out.push([[p.t0, p.v0], [p.t1, p.v1]]);
    else { const n = p.a ? 24 : 1, q = []; for (let k = 0; k <= n; k++) { const t = p.t0 + ((p.t1 - p.t0) * k) / n; q.push([t, moPositionAt({ pieces: [p] }, t)]); } out.push(q); }
  }
  // join pieces that meet (position is always continuous; velocity and acceleration where they do not jump)
  const joined = [];
  for (const q of out) { const prev = joined[joined.length - 1]; if (prev && Math.abs(prev[prev.length - 1][1] - q[0][1]) < 1e-9) prev.push(...q.slice(1)); else joined.push(q.slice()); }
  return joined;
}
const MO_UNIT = { position: 'm', velocity: 'm/s', acceleration: 'm/s²' };
function mgSegDraw(d, o) {
  const P = palette(o), W = figWords(o.lang), m = moMotion(d.segments, d.start || 0), views = d.graphs ? ['position', 'velocity', 'acceleration'].filter(g => d.graphs.includes(g)) : [SEG_TYPE[d.type]];
  const stacked = views.length > 1, h = stacked ? 130 : 280, blank = o.hide === true || hides(o, 'line'), tun = text(d.tunit, 8) || 's';
  const name = v => (v === 'position' && d.type === 'distance-time' ? W('distance') : v === 'position' && d.type === 'displacement-time' ? W('displacement') : W(v));
  const groups = []; let y = 0, wMax = 0;
  for (const [i, v] of views.entries()) {
    const vals = v === 'acceleration' ? m.pieces.map(p => p.a) : v === 'velocity' ? m.pieces.flatMap(p => [p.v0, p.v1]) : [m.pieces[0].x0, ...m.pieces.map(p => p.x1)];
    // a turning point inside a piece (v crosses 0) is the position's extreme: include it
    const turns = v === 'position' ? m.pieces.filter(p => p.a && p.v0 * p.v1 < 0).map(p => moPositionAt({ pieces: [p] }, p.t0 - p.v0 / p.a)) : [];
    const R = moRange(Math.min(...vals.filter(Number.isFinite), ...turns), Math.max(...vals.filter(Number.isFinite), ...turns));
    const A = axes([0, m.end], [R.from, R.to], o, { h, ystep: R.step, xtitle: (!stacked || i === views.length - 1) ? axisTitle(W('time'), tun) : '', ytitle: axisTitle(name(v), MO_UNIT[v]) });
    // the time axis along the bottom (so stacked graphs line up); a negative range gets its zero line drawn across
    const kids = [...A.kids, R.from < 0 ? line(A.X(0), A.Y(0), A.X(m.end), A.Y(0), P.ink, 2) : null];
    if (!blank) {
      if (d.shade && v === 'velocity' && !hides(o, 'area')) for (const p of m.pieces) kids.push(node('polygon', { points: [[p.t0, 0], [p.t0, p.v0], [p.t1, p.v1], [p.t1, 0]].map(q => `${r2(A.X(q[0]))},${r2(A.Y(q[1]))}`).join(' '), fill: P.fill, 'fill-opacity': 0.85, stroke: 'none' }));
      for (const q of moLines(m, v)) kids.push(poly(q.map(([t, val]) => [A.X(t), A.Y(val)]), { stroke: P.green, 'stroke-width': 3.5, class: `of-${v}` }));
      if (d.marks) {
        const at = k => { const p = m.pieces[Math.min(k, m.pieces.length - 1)], t = k < m.pieces.length ? p.t0 : p.t1; return [t, v === 'acceleration' ? p.a : v === 'velocity' ? (k < m.pieces.length ? p.v0 : p.v1) : (k < m.pieces.length ? p.x0 : p.x1)]; };
        for (let k = 0; k <= m.pieces.length; k++) { const [t, val] = at(k); kids.push(node('circle', { cx: A.X(t), cy: A.Y(val), r: 4, fill: P.ink }), label(A.X(t) + 5, A.Y(val) - 12, moLetter(k), { size: 13, colour: P.ink, halo: P.paper })); }
      }
    }
    groups.push(node('g', { transform: `translate(0 ${r2(y)})` }, kids));
    y += A.h - (stacked && i < views.length - 1 ? 20 : 0); wMax = Math.max(wMax, A.w);
  }
  return frame(wMax, y, groups, { ...o, kind: 'motionGraph' }, o.title || 'Motion graph');
}

// ---------------------------------------------------------------- motion map (1.1.0)
/**
 * { segments, start?, dt: the time between dots (s), labels?: "times" | "letters" | "none", arrows?: true (velocity
 * arrows; false for "add the arrows"), acceleration?: true (an acceleration arrow over each segment's dots, or a = 0),
 * numbers?: true (a numbered line in meters under the dots) }. A dot every dt at the true position, along a number line
 * in meters; every velocity arrow on one scale (equal speeds draw equal arrows, twice the speed twice as long); when
 * the motion turns back, the dots go on in a row of their own above, so dots never sit on each other; dots at one spot
 * (at rest) are one dot with its times. hide: true or "arrows" (the dots only), "positions" (no numbers on the line).
 */
const MAP_KEYS = ['kind', 'hide', 'segments', 'start', 'dt', 'labels', 'arrows', 'acceleration', 'numbers', 'heading'];
export const motionMap = {
  check(d) {
    const out = [];
    for (const k of Object.keys(d || {})) if (!MAP_KEYS.includes(k)) out.push(`"${k}" is not used by a motion map`);
    const m = moCheckSegments(d, out);
    if (!isNum(d.dt, 0.05, 1000)) out.push('"dt" must be the time between dots, in s');
    if (d.labels !== undefined && !['times', 'letters', 'none'].includes(d.labels)) out.push('"labels" must be "times", "letters" or "none"');
    for (const k of ['arrows', 'acceleration', 'numbers']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
    if (m && !out.length) {
      const n = m.end / d.dt;
      if (Math.abs(n - Math.round(n)) > 1e-6) out.push(`the motion lasts ${fmt(m.end)} s, not a whole number of steps of ${fmt(d.dt)} s: make the durations add up to a multiple of "dt"`);
      else if (n < 2 || n > 40) out.push(`a motion map needs 2 to 40 steps: this one has ${Math.round(n)} (change "dt")`);
      else if (m.pieces.every(p => p.v0 === 0 && p.v1 === 0)) out.push('the motion never moves: there is nothing to map');
    }
    return out;
  },
  /** The dots (each step's time, position and velocity), and the motion's numbers as for a motion graph. */
  solve(d) {
    if (motionMap.check(d).length) return null;
    const m = moMotion(d.segments, d.start || 0), n = Math.round(m.end / d.dt);
    return { ...moSolve(d), dots: Array.from({ length: n + 1 }, (_, k) => ({ t: k * d.dt, x: moPositionAt(m, k * d.dt), v: moVelocityAt(m, k * d.dt) })) };
  },
  draw(d, o) {
    const P = palette(o), lang = o.lang, m = moMotion(d.segments, d.start || 0), n = Math.round(m.end / d.dt);
    const dots = Array.from({ length: n + 1 }, (_, k) => ({ k, t: k * d.dt, x: moPositionAt(m, k * d.dt), v: moVelocityAt(m, k * d.dt) }));
    // runs: one way until it turns back (each run on its own row, the next above); dots at one spot share one dot
    const runs = []; let dir = 0;
    for (const q of dots) {
      const s = Math.abs(q.v) < 1e-9 ? 0 : Math.sign(q.v), prev = runs[runs.length - 1], last = prev && prev[prev.length - 1];
      const moved = last ? Math.sign(q.x - last.x) : 0;
      if (!prev || (moved && dir && moved !== dir)) { runs.push([q]); dir = moved || s || dir; continue; }
      if (last && Math.abs(q.x - last.x) < 1e-6) { (last.same = last.same || [last]).push(q); continue; }
      prev.push(q); dir = moved || dir;
    }
    const xs = dots.map(q => q.x), R = moRange(Math.min(...xs), Math.max(...xs)), LEN = 560, L = 90;   // room either side for an arrow off an end dot
    const X = x => L + ((x - R.from) / (R.to - R.from)) * LEN;
    // one arrow scale: the fastest is 0.8 of the widest gap between dots, never reaching the next dot
    const gaps = []; for (const r of runs) for (let i = 1; i < r.length; i++) gaps.push(Math.abs(X(r[i].x) - X(r[i - 1].x)));
    const vmax = Math.max(...dots.map(q => Math.abs(q.v))), wide = Math.max(...gaps, 20);
    let k = vmax ? (0.8 * wide) / vmax : 0;
    for (const r of runs) for (let i = 0; i + 1 < r.length; i++) if (Math.abs(r[i].v) > 1e-9) k = Math.min(k, Math.max(0.3 * wide / vmax, (Math.abs(X(r[i + 1].x) - X(r[i].x)) - 3) / Math.abs(r[i].v)));
    const showArrows = d.arrows !== false && o.hide !== true && !hides(o, 'arrows'), labels = d.labels || 'none';
    const ROW = 62 + (d.acceleration ? 34 : 0), top = 36 + (d.heading ? 22 : 0), lineY = top + runs.length * ROW + 24, kids = [];
    if (d.heading) kids.push(label(L + LEN / 2, 20, text(d.heading, 60), { anchor: 'middle', size: 15, colour: P.ink }));
    runs.forEach((r, i) => {
      const ry = lineY - 34 - i * ROW;
      for (const q of r) {
        kids.push(node('circle', { cx: X(q.x), cy: ry, r: 5.5, fill: P.ink, class: 'of-dot' }));
        if (showArrows && Math.abs(q.v) > 1e-9 && !q.same) kids.push(node('g', { class: 'of-velocity' }, arrow(X(q.x), ry - 15, X(q.x) + Math.sign(q.v) * k * Math.abs(q.v), ry - 15, { colour: P.green, width: 2.6, head: 9 })));
        const tag = labels === 'times' ? (q.same ? `${fmt(q.same[0].t, 2, lang)}–${fmt(q.same[q.same.length - 1].t, 2, lang)} s` : `${fmt(q.t, 2, lang)} s`) : labels === 'letters' ? (q.same ? q.same.map(z => moLetter(z.k)).join(', ') : moLetter(q.k)) : '';
        if (tag) kids.push(label(X(q.x), ry + 16, tag, { anchor: 'middle', size: 11, weight: 600, colour: P.ink2 }));
      }
      if (d.acceleration && showArrows) {
        // over each segment's dots in this row: its acceleration's way, or a = 0
        for (const p of m.pieces) {
          const inRow = r.filter(q => q.t >= p.t0 - 1e-9 && q.t <= p.t1 + 1e-9 && !(q.same && q.same[0].t < p.t0 - 1e-9));
          if (inRow.length < 2) continue;
          const xa = (X(inRow[0].x) + X(inRow[inRow.length - 1].x)) / 2, ya = ry - 44;
          if (Math.abs(p.a) < 1e-9) kids.push(label(xa, ya, 'a = 0', { anchor: 'middle', size: 12, colour: P.red, italic: true }));
          else kids.push(node('g', { class: 'of-acceleration' }, arrow(xa - Math.sign(p.a) * 18, ya, xa + Math.sign(p.a) * 18, ya, { colour: P.red, width: 2.4, head: 8 }), label(xa + 24 * (p.a > 0 ? 1 : -1), ya, 'a', { anchor: p.a > 0 ? 'start' : 'end', size: 13, italic: true, colour: P.red })));
        }
      }
    });
    // the number line in meters
    kids.push(line(L - 14, lineY, L + LEN + 18, lineY, P.ink, 2), node('polygon', { points: `${L + LEN + 26},${lineY} ${L + LEN + 16},${lineY - 5} ${L + LEN + 16},${lineY + 5}`, fill: P.ink }));
    const numbered = d.numbers !== false && !hides(o, 'positions');
    for (let v = R.from; v <= R.to + R.step * 1e-6; v += R.step) {
      kids.push(line(X(v), lineY - 6, X(v), lineY + 6, P.ink, 1.5));
      if (numbered) kids.push(label(X(v), lineY + 20, fmt(Math.round(v / R.step) * R.step, 2, lang), { anchor: 'middle', size: 12, weight: 600, colour: P.ink2 }));
    }
    if (numbered) kids.push(label(L + LEN + 26, lineY + 20, 'm', { anchor: 'end', size: 12, weight: 600, colour: P.ink2, italic: false }));
    return frame(L + LEN + 90, lineY + 40, kids, { ...o, kind: 'motionMap' }, o.title || figWords(lang)('motionMap'));
  },
};

export const MOTION_KINDS = { motionGraph, motionMap };
