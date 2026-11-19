// Oomba Figures: graphs. A coordinate grid (points, segments and y = f(x) from a formula), motion graphs (distance,
// displacement or velocity against time, with the area under a velocity-time graph), a half-life curve and a titration
// curve. Every point is placed by its numbers on evenly spaced axes, so a graph can be read off: a gradient is a
// gradient and an area is an area.
import { node, label, line, poly, frame, palette, seriesColour, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { evalExpr, exprProblem } from '../../canvas/src/expr.js';

/** Nice tick steps: 1, 2, 2.5 or 5 times a power of ten, about n ticks over the range. */
export function niceStep(range, n = 8) {
  const raw = range / n, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
const okRange = r => Array.isArray(r) && r.length === 2 && isNum(r[0], -1e6, 1e6) && isNum(r[1], -1e6, 1e6) && r[1] > r[0];

/**
 * Axes on graph paper: x from xr[0] to xr[1], y from yr[0] to yr[1]. -> { X, Y (world to screen), kids, w, h }.
 * o2: { w, h (the plot's size), xstep, ystep, xlabel, ylabel, lang, origin: draw the axes through 0 (a coordinate grid)
 * rather than along the bottom and left (a science graph) }.
 */
export function axes(xr, yr, o, o2 = {}) {
  const P = palette(o), lang = o.lang, w = o2.w || 420, h = o2.h || 280, L = o2.origin ? 30 : 64, T = 22, B = o2.origin ? 30 : 56, R = 26;
  const xs = o2.xstep || niceStep(xr[1] - xr[0]), ys = o2.ystep || niceStep(yr[1] - yr[0], 6);
  const X = x => L + ((x - xr[0]) / (xr[1] - xr[0])) * w, Y = y => T + h - ((y - yr[0]) / (yr[1] - yr[0])) * h;
  const kids = [];
  // the grid: fine lines at every tick, and five small squares between (graph paper) when there is room
  const fine = [];
  const minor = n => (w / ((xr[1] - xr[0]) / xs) >= 40 ? n : 1);
  const mx = minor(5), my = minor(5);
  for (let k = 0, x = xr[0]; x <= xr[1] + xs * 1e-6; k++, x = xr[0] + k * (xs / mx)) fine.push(line(X(x), T, X(x), T + h, k % mx ? P.grid : P.gridStrong, k % mx ? 0.6 : 1));
  for (let k = 0, y = yr[0]; y <= yr[1] + ys * 1e-6; k++, y = yr[0] + k * (ys / my)) fine.push(line(L, Y(y), L + w, Y(y), k % my ? P.grid : P.gridStrong, k % my ? 0.6 : 1));
  kids.push(node('g', { 'aria-hidden': 'true' }, fine));
  const ax = o2.origin && xr[0] <= 0 && xr[1] >= 0 ? X(0) : L, ay = o2.origin && yr[0] <= 0 && yr[1] >= 0 ? Y(0) : T + h;
  kids.push(line(L, ay, L + w + 8, ay, P.ink, 2), line(ax, T + h, ax, T - 8, P.ink, 2),
    node('polygon', { points: `${r2(L + w + 14)},${r2(ay)} ${r2(L + w + 4)},${r2(ay - 5)} ${r2(L + w + 4)},${r2(ay + 5)}`, fill: P.ink }),
    node('polygon', { points: `${r2(ax)},${r2(T - 14)} ${r2(ax - 5)},${r2(T - 4)} ${r2(ax + 5)},${r2(T - 4)}`, fill: P.ink }));
  // the numbers on the axes
  const dp = s => (Number.isInteger(s) ? 0 : String(s).split('.')[1].length);
  for (let k = 0, x = xr[0]; x <= xr[1] + xs * 1e-6; k++, x = xr[0] + k * xs) {
    const v = Math.round(x / xs) * xs; if (o2.origin && Math.abs(v) < 1e-9) continue;
    kids.push(line(X(v), ay - 4, X(v), ay + 4, P.ink, 1.5), label(X(v), ay + 15, fmt(v, dp(xs), lang), { anchor: 'middle', size: 12, weight: 600, colour: P.ink2 }));
  }
  for (let k = 0, y = yr[0]; y <= yr[1] + ys * 1e-6; k++, y = yr[0] + k * ys) {
    const v = Math.round(y / ys) * ys; if (o2.origin && Math.abs(v) < 1e-9) continue;
    kids.push(line(ax - 4, Y(v), ax + 4, Y(v), P.ink, 1.5), label(ax - 8, Y(v), fmt(v, dp(ys), lang), { anchor: 'end', size: 12, weight: 600, colour: P.ink2 }));
  }
  if (o2.origin) kids.push(label(ax - 7, ay + 14, '0', { anchor: 'end', size: 12, weight: 600, colour: P.ink2 }));
  if (o2.xlabel) kids.push(label(L + w / 2, T + h + 40, o2.xlabel, { anchor: 'middle', size: 13, colour: P.ink }));
  if (o2.ylabel) kids.push(node('g', { transform: `translate(16 ${r2(T + h / 2)}) rotate(-90)` }, label(0, 0, o2.ylabel, { anchor: 'middle', size: 13, colour: P.ink })));
  if (o2.origin) kids.push(label(L + w + 10, ay - 12, o2.xname || 'x', { anchor: 'end', size: 13, italic: true, colour: P.ink }), label(ax + 10, T - 6, o2.yname || 'y', { size: 13, italic: true, colour: P.ink }));
  return { X, Y, kids, w: L + w + R, h: T + h + B };
}
const axisTitle = (name, unit) => (unit ? `${name} (${unit})` : name);

// ---------------------------------------------------------------- the coordinate grid
/**
 * { x: [lo, hi], y: [lo, hi], step?: tick step, points?: [{ x, y, label? }], segments?: [{ from: [x, y], to: [x, y] }],
 * fns?: [{ expr: '2*x + 1', label?, from?, to? }] (a formula in x: the same small safe language as the generators),
 * shapes?: [{ points: [[x, y], ...], label? }] (a closed polygon) }. hide: no points' labels, no lines (a blank grid).
 */
export const grid = {
  check(d) {
    const out = [];
    if (!d || !okRange(d.x) || !okRange(d.y)) out.push('"x" and "y" must be ranges [lo, hi] with lo below hi');
    else if ((d.x[1] - d.x[0]) / (d.step || niceStep(d.x[1] - d.x[0])) > 60) out.push('too many grid lines: use a bigger "step"');
    if (d && d.step !== undefined && !isNum(d.step, 1e-6)) out.push('"step" must be a number above 0');
    for (const [i, f] of (Array.isArray(d && d.fns) ? d.fns : []).entries()) {
      const why = f && typeof f.expr === 'string' ? exprProblem(f.expr) : 'it needs "expr"';
      if (why) out.push(`fns ${i + 1}: ${why}`);
      else { try { evalExpr(f.expr, { x: (d.x[0] + d.x[1]) / 2 }); } catch (e) { if (!/finite/.test(e.message)) out.push(`fns ${i + 1}: ${e.message}`); } }
    }
    for (const [i, q] of (Array.isArray(d && d.points) ? d.points : []).entries()) if (!q || !isNum(q.x) || !isNum(q.y)) out.push(`point ${i + 1} needs numbers x and y`);
    return out;
  },
  draw(d, o) {
    const P = palette(o), lang = o.lang, step = d.step || null;
    const span = Math.max(d.x[1] - d.x[0], d.y[1] - d.y[0]), S = 400 / span;   // the same scale both ways: a square is a square
    const A = axes(d.x, d.y, o, { w: (d.x[1] - d.x[0]) * S, h: (d.y[1] - d.y[0]) * S, xstep: step, ystep: step, origin: true, xname: text(d.xname, 6), yname: text(d.yname, 6) });
    const kids = [...A.kids], blank = o.hide === true;
    const inX = x => x >= d.x[0] - 1e-9 && x <= d.x[1] + 1e-9, inY = y => y >= d.y[0] - 1e-9 && y <= d.y[1] + 1e-9;
    if (!blank) {
      (d.shapes || []).forEach((s, i) => { if (Array.isArray(s.points) && s.points.length >= 3) kids.push(node('polygon', { points: s.points.map(q => `${r2(A.X(q[0]))},${r2(A.Y(q[1]))}`).join(' '), fill: P.fill, 'fill-opacity': 0.6, stroke: seriesColour(o, i), 'stroke-width': 2.5 })); });
      (d.fns || []).forEach((f, i) => {
        const a = isNum(f.from) ? f.from : d.x[0], b = isNum(f.to) ? f.to : d.x[1], runs = [[]];
        for (let k = 0; k <= 240; k++) {
          const x = a + ((b - a) * k) / 240; let y;
          try { y = evalExpr(f.expr, { x }); } catch (e) { y = NaN; }
          if (Number.isFinite(y) && inY(y)) runs[runs.length - 1].push([A.X(x), A.Y(y)]); else if (runs[runs.length - 1].length) runs.push([]);
        }
        for (const r of runs) if (r.length > 1) kids.push(poly(r, { stroke: seriesColour(o, i), 'stroke-width': 3 }));
        // its name in a small key at the top left (two lines can leave the grid side by side)
        if (text(f.label, 24)) { const ky = 34 + i * 20, kx = A.X(d.x[0]) + 10; kids.push(node('rect', { x: kx - 4, y: ky - 9, width: 14 + text(f.label, 24).length * 8, height: 18, rx: 4, fill: P.paper, 'fill-opacity': 0.9 }), line(kx, ky, kx + 14, ky, seriesColour(o, i), 3.5), label(kx + 20, ky, text(f.label, 24), { size: 13, italic: true, colour: seriesColour(o, i) })); }
      });
      (d.segments || []).forEach((s, i) => { if (Array.isArray(s.from) && Array.isArray(s.to)) kids.push(line(A.X(s.from[0]), A.Y(s.from[1]), A.X(s.to[0]), A.Y(s.to[1]), seriesColour(o, i + 2), 3)); });
    }
    for (const q of d.points || []) {
      if (!inX(q.x) || !inY(q.y)) continue;
      kids.push(node('circle', { cx: A.X(q.x), cy: A.Y(q.y), r: 5, fill: P.red, stroke: P.paper, 'stroke-width': 1.5 }));
      if (!blank && !hides(o, 'labels')) {
        const t = text(q.label, 16), coords = q.coords ? `(${fmt(q.x, 2, lang)}, ${fmt(q.y, 2, lang)})` : '';
        const words = [t, coords].filter(Boolean).join(' ');
        if (words) kids.push(label(A.X(q.x) + 8, A.Y(q.y) - 12, words, { size: 13, colour: P.ink, halo: P.paper }));
      }
    }
    return frame(A.w, A.h, kids, { ...o, kind: 'grid' }, o.title || 'Coordinate grid');
  },
};

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
  draw(d, o) {
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

// ---------------------------------------------------------------- half-life
/**
 * { halfLife: T (> 0), start?: N0 (default 100), tmax?: (default 4 T, at most 8 T), unit?: 'days', yunit?: '%' |
 * 'counts/min' | ..., ylabel?, xlabel?, marks?: true (dashed lines at each half-life: N0/2 at T, N0/4 at 2T...) }.
 * N(t) = N0 × (1/2)^(t / T). hide: no dashed lines (the student reads the half-life off the curve).
 */
export const halfLife = {
  check(d) {
    const out = [];
    if (!d || !isNum(d.halfLife, 1e-6, 1e9)) out.push('"halfLife" must be a number above 0');
    if (d && d.start !== undefined && !isNum(d.start, 1e-6, 1e12)) out.push('"start" must be a number above 0');
    if (d && d.tmax !== undefined && !(isNum(d.tmax, 0) && d.tmax > 0 && d.tmax <= 8 * d.halfLife)) out.push('"tmax" must be above 0 and at most 8 half-lives');
    return out;
  },
  at: (d, t) => (d.start ?? 100) * 0.5 ** (t / d.halfLife),
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), T = d.halfLife, N0 = d.start ?? 100, tmax = d.tmax ?? 4 * T;
    const A = axes([0, tmax], [0, N0 * 1.1], o, { xstep: d.xstep || niceStep(tmax, 8), ystep: d.ystep, xlabel: text(d.xlabel, 40) || axisTitle(W('time'), text(d.unit, 10)), ylabel: text(d.ylabel, 40) || axisTitle(W('remaining'), text(d.yunit, 12)) });
    const kids = [...A.kids], pts = [];
    for (let k = 0; k <= 200; k++) { const t = (tmax * k) / 200; pts.push([A.X(t), A.Y(halfLife.at(d, t))]); }
    if (d.marks !== false && !hides(o, 'marks') && o.hide !== true) {
      for (let n = 1; n * T <= tmax + 1e-9 && n <= 4; n++) {
        const y = N0 / 2 ** n;
        kids.push(line(A.X(0), A.Y(y), A.X(n * T), A.Y(y), P.red, 1.6, { 'stroke-dasharray': '6 5' }), line(A.X(n * T), A.Y(y), A.X(n * T), A.Y(0), P.red, 1.6, { 'stroke-dasharray': '6 5' }));
      }
      kids.push(label(A.X(T) + 6, A.Y(N0 / 2) - 12, `${W('halfLife')} = ${fmt(T, 2, o.lang)}${d.unit ? ` ${text(d.unit, 10)}` : ''}`, { size: 13, colour: P.red, halo: P.paper }));
    }
    kids.push(poly(pts, { stroke: P.green, 'stroke-width': 3.5 }));
    return frame(A.w, A.h, kids, { ...o, kind: 'halfLife' }, o.title || 'Half-life curve');
  },
};

// ---------------------------------------------------------------- titration
/**
 * { acid: 'strong' | 'weak', base: 'strong' | 'weak', flask?: 'acid' (the base is added from the burette; default) |
 * 'base', ca?: mol/dm³ (0.1), cb?: (0.1), v0?: cm³ in the flask (25), vmax?: cm³ added (2 × the equivalence volume),
 * pKa?: 4.76 (a weak acid), pKb?: 4.75 (a weak base), marks?: true (the equivalence point; a weak acid's or base's half
 * way point, where pH = pKa) }. The pH at each volume comes from the charge balance solved exactly ([H+] by bisection,
 * Kw = 1e-14), so the start, the buffer region, the jump and the equivalence pH (7, above 7 or below 7) are where the
 * chemistry puts them. hide: no marks.
 */
export const titration = {
  check(d) {
    const out = [];
    if (!d || !['strong', 'weak'].includes(d.acid) || !['strong', 'weak'].includes(d.base)) out.push('"acid" and "base" must each be "strong" or "weak"');
    else if (d.acid === 'weak' && d.base === 'weak') out.push('a weak acid with a weak base has no sharp end point: use a strong one for one of them');
    for (const k of ['ca', 'cb']) if (d && d[k] !== undefined && !isNum(d[k], 0.001, 5)) out.push(`"${k}" must be a concentration from 0.001 to 5`);
    if (d && d.v0 !== undefined && !isNum(d.v0, 1, 500)) out.push('"v0" must be a volume from 1 to 500');
    if (d && d.pKa !== undefined && !isNum(d.pKa, 1, 13)) out.push('"pKa" must be from 1 to 13');
    if (d && d.pKb !== undefined && !isNum(d.pKb, 1, 13)) out.push('"pKb" must be from 1 to 13');
    if (d && d.flask !== undefined && !['acid', 'base'].includes(d.flask)) out.push('"flask" must be "acid" or "base"');
    return out;
  },
  /** The equivalence volume (cm³ added from the burette). */
  veq: d => (d.flask === 'base' ? ((d.cb ?? 0.1) * (d.v0 ?? 25)) / (d.ca ?? 0.1) : ((d.ca ?? 0.1) * (d.v0 ?? 25)) / (d.cb ?? 0.1)),
  /** The pH after v cm³ from the burette. */
  pH(d, v) {
    const v0 = d.v0 ?? 25, ca = d.ca ?? 0.1, cb = d.cb ?? 0.1, Kw = 1e-14;
    const acidIn = d.flask !== 'base', Vt = v0 + v;
    const CA = acidIn ? (ca * v0) / Vt : (ca * v) / Vt, CB = acidIn ? (cb * v) / Vt : (cb * v0) / Vt;
    const Ka = d.acid === 'strong' ? 1e8 : 10 ** -(d.pKa ?? 4.76), Kb = d.base === 'strong' ? 1e8 : 10 ** -(d.pKb ?? 4.75);
    // charge balance: [H+] + [BH+] = [OH-] + [A-]; [A-] = CA Ka/(Ka + h), [BH+] = CB Kb h /(Kb h + Kw) (= CB for a strong base)
    const f = h => h + (CB * Kb * h) / (Kb * h + Kw) - Kw / h - (CA * Ka) / (Ka + h);
    let lo = -15, hi = 1;   // log10 [H+]; f grows with h
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(10 ** m) > 0) hi = m; else lo = m; }
    return -(lo + hi) / 2;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), ve = titration.veq(d), vmax = d.vmax ?? Math.min(100, 2 * ve);
    const A = axes([0, vmax], [0, 14], o, { ystep: 2, xstep: d.xstep, xlabel: text(d.xlabel, 50) || axisTitle(W('volumeAdded'), 'cm³'), ylabel: text(d.ylabel, 30) || 'pH' });
    const kids = [...A.kids], pts = [];
    for (let k = 0; k <= 400; k++) { const v = (vmax * k) / 400; pts.push([A.X(v), A.Y(Math.max(0, Math.min(14, titration.pH(d, v))))]); }
    if (d.marks !== false && o.hide !== true && !hides(o, 'marks')) {
      const pe = titration.pH(d, ve);
      kids.push(line(A.X(ve), A.Y(0), A.X(ve), A.Y(pe), P.red, 1.6, { 'stroke-dasharray': '6 5' }), line(A.X(0), A.Y(pe), A.X(ve), A.Y(pe), P.red, 1.6, { 'stroke-dasharray': '6 5' }),
        node('circle', { cx: A.X(ve), cy: A.Y(pe), r: 5, fill: P.red }), label(A.X(ve) + 9, A.Y(pe) + (pe > 7 ? 16 : -14), `${W('eqPoint')}: pH ${fmt(pe, 1, o.lang)}`, { size: 13, colour: P.red, halo: P.paper }));
      // the half-way point (pH = pKa) means something only when the weak acid or weak base is the one in the flask
      if ((d.flask !== 'base' && d.acid === 'weak') || (d.flask === 'base' && d.base === 'weak')) {
        const ph = titration.pH(d, ve / 2);
        kids.push(node('circle', { cx: A.X(ve / 2), cy: A.Y(ph), r: 4.5, fill: P.blue }), label(A.X(ve / 2) - 8, A.Y(ph) - 14, `pH ${fmt(ph, 2, o.lang)} = ${d.acid === 'weak' ? 'pKa' : '14 − pKb'}`, { anchor: 'end', size: 12, colour: P.blue, halo: P.paper }));
      }
    }
    kids.push(poly(pts, { stroke: P.green, 'stroke-width': 3.5 }));
    return frame(A.w, A.h, kids, { ...o, kind: 'titration' }, o.title || 'Titration curve');
  },
};

export const GRAPHS = { grid, motionGraph, halfLife, titration };
