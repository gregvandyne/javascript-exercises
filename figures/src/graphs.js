// Oomba Figures: graphs. The axes every graph is drawn on (axes, niceStep) and the coordinate grid (points, segments and
// y = f(x) from a formula), in the core: every subject plots on them. The motion graphs (motion.js, the physics pack)
// and the half-life and titration curves (curves.js, the chemistry pack) draw on the same axes. Every point is placed
// by its numbers on evenly spaced axes, so a graph can be read off: a gradient is a gradient and an area is an area.
import { node, label, line, poly, frame, palette, seriesColour, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { evalExpr, exprProblem } from '../../canvas/src/expr.js';
import { radiansExpr, anglesProblem } from './radians.js';
import { NUMBERINGS, niceText } from './ported/numbering.js';
import { tfImages, tfPrimed, tfDescribe } from './ported/transform.js';

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
  const P = palette(o), lang = o.lang, w = o2.w || 420, h = o2.h || 280, L = (o2.origin ? 30 : 64) + (o2.ytitle ? 26 : 0), T = 22, B = (o2.origin ? 30 : 56) + (o2.xtitle ? 26 : 0), R = 26;
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
    kids.push(line(X(v), ay - 4, X(v), ay + 4, P.ink, 1.5), label(X(v), ay + 15, o2.xfmt ? o2.xfmt(v) : fmt(v, dp(xs), lang), { anchor: 'middle', size: 12, weight: 600, colour: P.ink2 }));
  }
  for (let k = 0, y = yr[0]; y <= yr[1] + ys * 1e-6; k++, y = yr[0] + k * ys) {
    const v = Math.round(y / ys) * ys; if (o2.origin && Math.abs(v) < 1e-9) continue;
    kids.push(line(ax - 4, Y(v), ax + 4, Y(v), P.ink, 1.5), label(ax - 8, Y(v), o2.yfmt ? o2.yfmt(v) : fmt(v, dp(ys), lang), { anchor: 'end', size: 12, weight: 600, colour: P.ink2 }));
  }
  if (o2.origin) kids.push(label(ax - 7, ay + 14, '0', { anchor: 'end', size: 12, weight: 600, colour: P.ink2 }));
  if (o2.xlabel) kids.push(label(L + w / 2, T + h + 40, o2.xlabel, { anchor: 'middle', size: 13, colour: P.ink }));
  if (o2.ylabel) kids.push(node('g', { transform: `translate(16 ${r2(T + h / 2)}) rotate(-90)` }, label(0, 0, o2.ylabel, { anchor: 'middle', size: 13, colour: P.ink })));
  if (o2.xtitle) kids.push(label(L + w / 2, T + h + B - 12, o2.xtitle, { anchor: 'middle', size: 13, colour: P.ink, cls: 'of-axis-title' }));
  if (o2.ytitle) kids.push(node('g', { transform: `translate(16 ${r2(T + h / 2)}) rotate(-90)` }, label(0, 0, o2.ytitle, { anchor: 'middle', size: 13, colour: P.ink, cls: 'of-axis-title' })));
  if (o2.origin) kids.push(label(L + w + 10, ay - 12, o2.xname || 'x', { anchor: 'end', size: 13, italic: true, colour: P.ink }), label(ax + 10, T - 6, o2.yname || 'y', { size: 13, italic: true, colour: P.ink }));
  return { X, Y, kids, w: L + w + R, h: T + h + B };
}
export const axisTitle = (name, unit) => (unit ? `${name} (${unit})` : name);

// ---------------------------------------------------------------- the coordinate grid
/**
 * { x: [lo, hi], y: [lo, hi], step?: tick step, points?: [{ x, y, label? }], segments?: [{ from: [x, y], to: [x, y] }],
 * fns?: [{ expr: '2*x + 1', label?, from?, to? }] (a formula in x: the same small safe language as the generators),
 * shapes?: [{ points: [[x, y], ...], label? }] (a closed polygon) }. hide: no points' labels, no lines (a blank grid).
 * Since 1.1.0 (docs/figures-api.md "The coordinate grid, extended"): a range or step can be a fraction [n, d] or a
 * multiple of π { pi: k }; xstep and ystep; numbering, xnumbering, ynumbering ("decimal", "fraction", "pi", "degree");
 * xtitle and ytitle along the axes; a function's ends closed or open (fromClosed, toClosed: a piecewise function is
 * several), its holes, dash; verticals (x = c), asymptotes (dashed); inequalities shaded on their side of the boundary
 * (y against a formula, or x or y against a number; dashed when strict); points open: true; and a shape's names and its
 * transform (translations, reflections, rotations by quarter turns, dilations: the image is worked out, never given).
 */
const GRID_SIGNS = ['<', '<=', '>', '>='];
const gridVal = v => (isNum(v, -1e6, 1e6) ? v : Array.isArray(v) && v.length === 2 && Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[1] > 0 ? v[0] / v[1] : v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && isNum(v.pi, -1e3, 1e3) ? v.pi * Math.PI : null);
const gridRange = r => (Array.isArray(r) && r.length === 2 ? r.map(gridVal) : null);
const gridForm = v => (Array.isArray(v) ? 'fraction' : v && typeof v === 'object' && 'pi' in v ? 'pi' : null);
/** A transform's steps, read from { translate: [dx, dy] } | { reflect: "x-axis" | "y-axis" | "y=x" | "y=-x" | { x } | { y } }
 *  | { rotate: degrees (counterclockwise; multiples of 90), about: [x, y] } | { dilate: k, about } (one or a list). */
function gridSteps(t, out, at) {
  const list = Array.isArray(t) ? t : [t], steps = [];
  if (!list.length || list.length > 3) { out.push(`${at}: "transform" must be one step or a list of up to 3`); return null; }
  for (const s of list) {
    const about = s && s.about === undefined ? [0, 0] : s && Array.isArray(s.about) && s.about.length === 2 && s.about.every(v => isNum(v, -1e6, 1e6)) ? s.about : null;
    const keys = s && typeof s === 'object' ? Object.keys(s).filter(k => k !== 'about') : [];
    if (keys.length !== 1) { out.push(`${at}: each step is one of { "translate" }, { "reflect" }, { "rotate", "about" }, { "dilate", "about" }`); return null; }
    if ('translate' in s) {
      if (!Array.isArray(s.translate) || s.translate.length !== 2 || !s.translate.every(v => isNum(v, -1e6, 1e6))) { out.push(`${at}: "translate" must be [dx, dy]`); return null; }
      steps.push({ kind: 'translate', dx: s.translate[0], dy: s.translate[1] });
    } else if ('reflect' in s) {
      const r = s.reflect, named = { 'x-axis': { kind: 'horizontal', c: 0 }, 'y-axis': { kind: 'vertical', c: 0 }, 'y=x': { kind: 'diagonal', slope: 1, b: 0 }, 'y=-x': { kind: 'diagonal', slope: -1, b: 0 } };
      const line = typeof r === 'string' ? named[r.replace(/\s+/g, '').replace('−', '-')] : r && isNum(r.x, -1e6, 1e6) && Object.keys(r).length === 1 ? { kind: 'vertical', c: r.x } : r && isNum(r.y, -1e6, 1e6) && Object.keys(r).length === 1 ? { kind: 'horizontal', c: r.y } : null;
      if (!line) { out.push(`${at}: "reflect" must be "x-axis", "y-axis", "y=x", "y=-x", { "x": c } or { "y": c }`); return null; }
      steps.push({ kind: 'reflect', line });
    } else if ('rotate' in s) {
      if (!isNum(s.rotate) || s.rotate === 0 || Math.abs(s.rotate) > 270 || s.rotate % 90 !== 0) { out.push(`${at}: "rotate" must be 90, 180 or 270 degrees (counterclockwise; negative for clockwise)`); return null; }
      if (!about) { out.push(`${at}: "about" must be a point [x, y]`); return null; }
      steps.push({ kind: 'rotate', deg: s.rotate, about });
    } else if ('dilate' in s) {
      if (!isNum(s.dilate, 0.05, 10) || s.dilate === 1) { out.push(`${at}: "dilate" (the scale factor) must be above 0, not 1, and at most 10`); return null; }
      if (!about) { out.push(`${at}: "about" must be a point [x, y]`); return null; }
      steps.push({ kind: 'dilate', k: s.dilate, about });
    } else { out.push(`${at}: each step is one of { "translate" }, { "reflect" }, { "rotate", "about" }, { "dilate", "about" }`); return null; }
  }
  return steps;
}
/** A grid in radians (angles: "radians") as the formula language works it out: its formulas rewritten (radians.js), the
 *  option then spent, so a grid in degrees (the default) is read and drawn exactly as before. */
const gridRad = d => {
  if (!d || d.angles !== 'radians') return d;
  const rw = list => (Array.isArray(list) ? list.map(f => (f && typeof f.expr === 'string' ? { ...f, expr: radiansExpr(f.expr) } : f)) : list);
  return { ...d, angles: undefined, ...('fns' in d ? { fns: rw(d.fns) } : {}), ...('inequalities' in d ? { inequalities: rw(d.inequalities) } : {}) };
};
/** A formula's value at x, or NaN (never throws). */
const gridAt = (expr, x) => { try { const y = evalExpr(expr, { x }); return Number.isFinite(y) ? y : NaN; } catch (e) { return NaN; } };
/** The 1.1.0 options, read and checked (problems into out). */
function gridMore(d, xr, yr, out) {
  const inX = x => x >= xr[0] - 1e-9 && x <= xr[1] + 1e-9, inY = y => y >= yr[0] - 1e-9 && y <= yr[1] + 1e-9;
  for (const k of ['xstep', 'ystep']) if (d[k] !== undefined && !(gridVal(d[k]) > 1e-9)) out.push(`"${k}" must be a number above 0, a fraction [n, d] or { "pi": k }`);
  for (const k of ['numbering', 'xnumbering', 'ynumbering']) if (d[k] !== undefined && !NUMBERINGS.includes(d[k])) out.push(`"${k}" must be one of ${NUMBERINGS.join(', ')}`);
  for (const k of ['xtitle', 'ytitle']) if (d[k] !== undefined && typeof d[k] !== 'string') out.push(`"${k}" must be short text`);
  const lineAt = k => { const v = d[k] !== undefined ? gridVal(d[k]) : d.step || null; return v; };
  for (const [k, r] of [['xstep', xr], ['ystep', yr]]) { const s = lineAt(k); if (s && (r[1] - r[0]) / s > 60) out.push(`too many grid lines: use a bigger "${k}"`); }
  (Array.isArray(d.fns) ? d.fns : []).forEach((f, i) => {
    if (!f || typeof f.expr !== 'string') return;
    for (const k of ['fromClosed', 'toClosed', 'dash']) if (f[k] !== undefined && typeof f[k] !== 'boolean') out.push(`fns ${i + 1}: "${k}" must be true or false`);
    for (const [k, end] of [['fromClosed', 'from'], ['toClosed', 'to']]) if (f[k] !== undefined) {
      if (!isNum(f[end])) out.push(`fns ${i + 1}: "${k}" draws a circle at the end "${end}": give "${end}"`);
      else { const y = gridAt(f.expr, f[end]); if (!Number.isFinite(y) || !inX(f[end]) || !inY(y)) out.push(`fns ${i + 1}: the end at x = ${fmt(f[end], 3)} must be on the grid (its value there is ${Number.isFinite(y) ? fmt(y, 3) : 'not a number'})`); }
    }
    if (f.holes !== undefined) {
      if (!Array.isArray(f.holes) || f.holes.length > 5 || !f.holes.every(v => isNum(v))) out.push(`fns ${i + 1}: "holes" must list up to 5 values of x`);
      else for (const h of f.holes) { const l = gridAt(f.expr, h - 1e-6), r = gridAt(f.expr, h + 1e-6), y = (l + r) / 2; if (!Number.isFinite(y) || Math.abs(l - r) > 1e-3 * Math.max(1, Math.abs(y)) || !inX(h) || !inY(y)) out.push(`fns ${i + 1}: the hole at x = ${fmt(h, 3)} must be on the grid, where the curve comes to a value`); }
    }
  });
  for (const [k, what] of [['verticals', 'x'], ['asymptotes', null]]) {
    if (d[k] === undefined) continue;
    if (!Array.isArray(d[k]) || d[k].length > 6) { out.push(`"${k}" must be a list, like [{ "x": 3 }]`); continue; }
    d[k].forEach((v, i) => { const ok = v && (isNum(v.x) ? inX(v.x) : !what && isNum(v.y) && inY(v.y)); if (!ok) out.push(`${k} ${i + 1}: must be { "x": a number on the grid }${what ? '' : ' or { "y": ... }'}`); });
  }
  if (d.inequalities !== undefined) {
    if (!Array.isArray(d.inequalities) || d.inequalities.length > 4) out.push('"inequalities" must be a list of up to 4, like [{ "expr": "2*x + 1", "sign": ">" }]');
    else d.inequalities.forEach((q, i) => {
      if (!q || !GRID_SIGNS.includes(q.sign)) { out.push(`inequalities ${i + 1}: "sign" must be one of ${GRID_SIGNS.join(' ')} (y against the formula, or x or y against a number)`); return; }
      const n = ['expr', 'x', 'y'].filter(k => q[k] !== undefined);
      if (n.length !== 1) { out.push(`inequalities ${i + 1}: give one of "expr" (y ${q.sign} the formula), "x" or "y" (a number)`); return; }
      if (q.expr !== undefined) {
        const why = typeof q.expr === 'string' ? exprProblem(q.expr) : 'it needs a formula in x';
        if (why) { out.push(`inequalities ${i + 1}: ${why}`); return; }
        for (let k = 0; k <= 60; k++) if (!Number.isFinite(gridAt(q.expr, xr[0] + ((xr[1] - xr[0]) * k) / 60))) { out.push(`inequalities ${i + 1}: the boundary must have a value all the way across the grid (a straight line or a curve with no gaps)`); return; }
      } else if (!isNum(q[n[0]])) out.push(`inequalities ${i + 1}: "${n[0]}" must be a number`);
      if (q.label !== undefined && typeof q.label !== 'string') out.push(`inequalities ${i + 1}: "label" must be short text`);
    });
  }
  for (const [i, q] of (Array.isArray(d.points) ? d.points : []).entries()) if (q && q.open !== undefined && typeof q.open !== 'boolean') out.push(`point ${i + 1}: "open" must be true or false`);
  const shapes = [];
  for (const [i, s] of (Array.isArray(d.shapes) ? d.shapes : []).entries()) {
    const at = `shape ${i + 1}`;
    if (!s || !Array.isArray(s.points) || s.points.length < 1 || !s.points.every(p => Array.isArray(p) && p.length === 2 && p.every(v => isNum(v)))) { if (s && (s.names || s.transform)) out.push(`${at}: "points" must list its corners [x, y]`); shapes.push(null); continue; }
    if (s.names !== undefined && (!Array.isArray(s.names) || s.names.length !== s.points.length || s.names.some(nm => typeof nm !== 'string' || nm.length > 4))) out.push(`${at}: "names" must list one short name for each corner`);
    let images = [];
    if (s.transform !== undefined) {
      const steps = gridSteps(s.transform, out, at);
      if (steps) {
        images = tfImages(s.points, steps).map((pts, k) => ({ pts, step: steps[k] }));
        images.forEach(({ pts }, k) => { if (pts.some(([x, y]) => !inX(x) || !inY(y))) out.push(`${at}: its image${images.length > 1 ? ` after step ${k + 1}` : ''} runs off the grid (${pts.map(([x, y]) => `(${fmt(x, 3)}, ${fmt(y, 3)})`).join(', ')}): widen the grid or move the shape`); });
      }
    }
    if (s.points.some(([x, y]) => !inX(x) || !inY(y)) && (s.names || s.transform)) out.push(`${at}: a corner is off the grid`);
    shapes.push({ images });
  }
  return { shapes };
}
export const grid = {
  check(d) {
    const out = [];
    if (d && anglesProblem(d.angles)) out.push(anglesProblem(d.angles));
    d = gridRad(d);
    const xr = d && gridRange(d.x), yr = d && gridRange(d.y);
    if (!d || !okRange(xr) || !okRange(yr)) out.push('"x" and "y" must be ranges [lo, hi] with lo below hi');
    else if ((xr[1] - xr[0]) / (d.step || niceStep(xr[1] - xr[0])) > 60) out.push('too many grid lines: use a bigger "step"');
    if (d && d.step !== undefined && !isNum(d.step, 1e-6)) out.push('"step" must be a number above 0');
    for (const [i, f] of (Array.isArray(d && d.fns) ? d.fns : []).entries()) {
      const why = f && typeof f.expr === 'string' ? exprProblem(f.expr) : 'it needs "expr"';
      if (why) out.push(`fns ${i + 1}: ${why}`);
      else if (okRange(xr)) { try { evalExpr(f.expr, { x: (xr[0] + xr[1]) / 2 }); } catch (e) { if (!/finite/.test(e.message)) out.push(`fns ${i + 1}: ${e.message}`); } }
    }
    for (const [i, q] of (Array.isArray(d && d.points) ? d.points : []).entries()) if (!q || !isNum(q.x) || !isNum(q.y)) out.push(`point ${i + 1} needs numbers x and y`);
    if (!out.length) gridMore(d, xr, yr, out);
    return out;
  },
  /** The numbers behind the grid: each shape's corners and its images (each step, in order), with the steps in words. */
  solve(d) {
    if (grid.check(d).length) return null;
    d = gridRad(d);
    const more = gridMore(d, gridRange(d.x), gridRange(d.y), []);
    return { shapes: (d.shapes || []).map((s, i) => ({ points: s.points, names: s.names || null, images: more.shapes[i] ? more.shapes[i].images.map(m => m.pts) : [], steps: more.shapes[i] ? more.shapes[i].images.map(m => tfDescribe(m.step)) : [] })) };
  },
  draw(d, o) {
    d = gridRad(d);
    const P = palette(o), lang = o.lang, step = d.step || null, xr = gridRange(d.x), yr = gridRange(d.y);
    const span = Math.max(xr[1] - xr[0], yr[1] - yr[0]), S = 400 / span;   // the same scale both ways: a square is a square
    const xstep = d.xstep !== undefined ? gridVal(d.xstep) : step, ystep = d.ystep !== undefined ? gridVal(d.ystep) : step;
    const numbering = ax => d[`${ax}numbering`] || d.numbering || gridForm(d[`${ax}step`]) || gridForm(d[ax][0]) || gridForm(d[ax][1]);
    const fmtOf = ax => { const n = numbering(ax); return n && n !== 'decimal' ? v => niceText(v, n, lang) : null; };
    const A = axes(xr, yr, o, { w: (xr[1] - xr[0]) * S, h: (yr[1] - yr[0]) * S, xstep, ystep, origin: true, xname: text(d.xname, 6), yname: text(d.yname, 6), xfmt: fmtOf('x'), yfmt: fmtOf('y'), xtitle: text(d.xtitle, 40), ytitle: text(d.ytitle, 40) });
    const kids = [...A.kids], blank = o.hide === true;
    const inX = x => x >= xr[0] - 1e-9 && x <= xr[1] + 1e-9, inY = y => y >= yr[0] - 1e-9 && y <= yr[1] + 1e-9;
    const more = gridMore(d, xr, yr, []);
    const ring = (x, y, closed, c) => node('circle', { cx: A.X(x), cy: A.Y(y), r: 5, fill: closed ? c : P.paper, stroke: c, 'stroke-width': 2.2, class: closed ? 'of-closed' : 'of-open' });
    if (!blank) {
      // inequalities first, under everything: the region shaded, its boundary dashed when strict
      (d.inequalities || []).forEach((q, i) => {
        const c = seriesColour(o, i), above = q.sign[0] === '>', strict = q.sign.length === 1, dash = strict ? '8 6' : null;
        let region, edge;
        if (q.expr !== undefined) {
          const pts = []; for (let k = 0; k <= 240; k++) { const x = xr[0] + ((xr[1] - xr[0]) * k) / 240; pts.push([x, Math.max(yr[0], Math.min(yr[1], gridAt(q.expr, x)))]); }
          region = [...pts, [xr[1], above ? yr[1] : yr[0]], [xr[0], above ? yr[1] : yr[0]]];
          edge = pts.filter(([x, y]) => y > yr[0] && y < yr[1] || true);
          const runs = [[]];
          for (let k = 0; k <= 240; k++) { const x = xr[0] + ((xr[1] - xr[0]) * k) / 240, y = gridAt(q.expr, x); if (inY(y)) runs[runs.length - 1].push([A.X(x), A.Y(y)]); else if (runs[runs.length - 1].length) runs.push([]); }
          edge = runs;
        } else if (q.x !== undefined) {
          const x = Math.max(xr[0], Math.min(xr[1], q.x));
          region = [[x, yr[0]], [x, yr[1]], [above ? xr[1] : xr[0], yr[1]], [above ? xr[1] : xr[0], yr[0]]];
          edge = inX(q.x) ? [[[A.X(q.x), A.Y(yr[0])], [A.X(q.x), A.Y(yr[1])]]] : [];
        } else {
          const y = Math.max(yr[0], Math.min(yr[1], q.y));
          region = [[xr[0], y], [xr[1], y], [xr[1], above ? yr[1] : yr[0]], [xr[0], above ? yr[1] : yr[0]]];
          edge = inY(q.y) ? [[[A.X(xr[0]), A.Y(q.y)], [A.X(xr[1]), A.Y(q.y)]]] : [];
        }
        kids.push(node('polygon', { points: region.map(([x, y]) => `${r2(A.X(x))},${r2(A.Y(y))}`).join(' '), fill: o.print ? '#000000' : c, 'fill-opacity': o.print ? 0.12 : 0.16, stroke: 'none', class: 'of-shade' }));
        for (const r of edge) if (r.length > 1) kids.push(poly(r, { stroke: c, 'stroke-width': 3, 'stroke-dasharray': dash, class: 'of-boundary' }));
        if (text(q.label, 24)) { const ky = 34 + ((d.fns || []).length + i) * 20, kx = A.X(xr[0]) + 10; kids.push(node('rect', { x: kx - 4, y: ky - 9, width: 14 + text(q.label, 24).length * 8, height: 18, rx: 4, fill: P.paper, 'fill-opacity': 0.9 }), line(kx, ky, kx + 14, ky, c, 3.5), label(kx + 20, ky, text(q.label, 24), { size: 13, italic: true, colour: c })); }
      });
      (d.asymptotes || []).forEach(a => { kids.push(isNum(a.x) ? line(A.X(a.x), A.Y(yr[0]), A.X(a.x), A.Y(yr[1]), P.ink2, 1.8, { 'stroke-dasharray': '3 5', class: 'of-asymptote' }) : line(A.X(xr[0]), A.Y(a.y), A.X(xr[1]), A.Y(a.y), P.ink2, 1.8, { 'stroke-dasharray': '3 5', class: 'of-asymptote' })); });
      (d.shapes || []).forEach((s, i) => {
        if (!Array.isArray(s.points) || s.points.length < 3) return;
        kids.push(node('polygon', { points: s.points.map(q => `${r2(A.X(q[0]))},${r2(A.Y(q[1]))}`).join(' '), fill: P.fill, 'fill-opacity': 0.6, stroke: seriesColour(o, i), 'stroke-width': 2.5 }));
      });
      (d.fns || []).forEach((f, i) => {
        const a = isNum(f.from) ? f.from : xr[0], b = isNum(f.to) ? f.to : xr[1], runs = [[]];
        for (let k = 0; k <= 240; k++) {
          const x = a + ((b - a) * k) / 240; let y;
          try { y = evalExpr(f.expr, { x }); } catch (e) { y = NaN; }
          if (Number.isFinite(y) && inY(y)) runs[runs.length - 1].push([A.X(x), A.Y(y)]); else if (runs[runs.length - 1].length) runs.push([]);
        }
        for (const r of runs) if (r.length > 1) kids.push(poly(r, { stroke: seriesColour(o, i), 'stroke-width': 3, ...(f.dash ? { 'stroke-dasharray': '8 6' } : {}) }));
        // its name in a small key at the top left (two lines can leave the grid side by side)
        if (text(f.label, 24)) { const ky = 34 + i * 20, kx = A.X(xr[0]) + 10; kids.push(node('rect', { x: kx - 4, y: ky - 9, width: 14 + text(f.label, 24).length * 8, height: 18, rx: 4, fill: P.paper, 'fill-opacity': 0.9 }), line(kx, ky, kx + 14, ky, seriesColour(o, i), 3.5), label(kx + 20, ky, text(f.label, 24), { size: 13, italic: true, colour: seriesColour(o, i) })); }
        for (const [k, end] of [['fromClosed', 'from'], ['toClosed', 'to']]) if (typeof f[k] === 'boolean') kids.push(ring(f[end], gridAt(f.expr, f[end]), f[k], seriesColour(o, i)));
        for (const h of f.holes || []) kids.push(ring(h, (gridAt(f.expr, h - 1e-6) + gridAt(f.expr, h + 1e-6)) / 2, false, seriesColour(o, i)));
      });
      (d.verticals || []).forEach((v, i) => {
        const c = seriesColour(o, (d.fns || []).length + i);
        kids.push(line(A.X(v.x), A.Y(yr[0]), A.X(v.x), A.Y(yr[1]), c, 3, { class: 'of-vertical' }));
        if (text(v.label, 16)) kids.push(label(A.X(v.x) + 6, A.Y(yr[1]) + 12, text(v.label, 16), { size: 13, italic: true, colour: c, halo: P.paper }));
      });
      (d.segments || []).forEach((s, i) => { if (Array.isArray(s.from) && Array.isArray(s.to)) kids.push(line(A.X(s.from[0]), A.Y(s.from[1]), A.X(s.to[0]), A.Y(s.to[1]), seriesColour(o, i + 2), 3)); });
      // transformations: the line of reflection or the center, the images (dashed), the corners' names with primes
      (d.shapes || []).forEach((s, i) => {
        const m = more.shapes[i];
        const nameAt = (pts, names, colour) => {
          if (!names || hides(o, 'labels')) return;
          const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length, cy = pts.reduce((t, p) => t + p[1], 0) / pts.length;
          pts.forEach(([x, y], k) => {
            const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = -dy / len;
            kids.push(node('circle', { cx: A.X(x), cy: A.Y(y), r: 3.5, fill: colour }), label(A.X(x) + ux * 13, A.Y(y) + uy * 13, names[k], { anchor: 'middle', size: 14, italic: true, colour, halo: P.paper }));
          });
        };
        if (s.names && !(m && m.images.length && Array.isArray(s.points) && s.points.length < 3)) nameAt(s.points, s.names, seriesColour(o, i));
        if (!m || !m.images.length || hides(o, 'image')) return;
        m.images.forEach(({ pts, step }, k) => {
          const c = seriesColour(o, i + k + 1);
          if (step.kind === 'reflect') {
            const L = step.line, seg = L.kind === 'vertical' ? [[L.c, yr[0]], [L.c, yr[1]]] : L.kind === 'horizontal' ? [[xr[0], L.c], [xr[1], L.c]]
              : (() => { const ys = x => L.slope * x + L.b, cand = [[xr[0], ys(xr[0])], [xr[1], ys(xr[1])], [(yr[0] - L.b) / L.slope, yr[0]], [(yr[1] - L.b) / L.slope, yr[1]]].filter(([x, y]) => inX(x) && inY(y)); return cand.length >= 2 ? [cand[0], cand[cand.length - 1]] : null; })();
            if (seg) kids.push(line(A.X(seg[0][0]), A.Y(seg[0][1]), A.X(seg[1][0]), A.Y(seg[1][1]), P.ink2, 1.8, { 'stroke-dasharray': '7 5', class: 'of-mirror' }));
          } else if (step.kind !== 'translate') kids.push(node('circle', { cx: A.X(step.about[0]), cy: A.Y(step.about[1]), r: 4.5, fill: P.ink, class: 'of-center' }));
          if (pts.length >= 3) kids.push(node('polygon', { points: pts.map(q => `${r2(A.X(q[0]))},${r2(A.Y(q[1]))}`).join(' '), fill: 'none', stroke: c, 'stroke-width': 2.5, 'stroke-dasharray': '8 5', class: 'of-image' }));
          else if (pts.length === 2) kids.push(line(A.X(pts[0][0]), A.Y(pts[0][1]), A.X(pts[1][0]), A.Y(pts[1][1]), c, 2.5, { 'stroke-dasharray': '8 5', class: 'of-image' }));
          nameAt(pts, s.names && s.names.map(nm => tfPrimed(nm, k + 1)), c);
        });
      });
    }
    for (const q of d.points || []) {
      if (!inX(q.x) || !inY(q.y)) continue;
      kids.push(q.open ? ring(q.x, q.y, false, P.red) : node('circle', { cx: A.X(q.x), cy: A.Y(q.y), r: 5, fill: P.red, stroke: P.paper, 'stroke-width': 1.5 }));
      if (!blank && !hides(o, 'labels')) {
        const t = text(q.label, 16), coords = q.coords ? `(${fmt(q.x, 2, lang)}, ${fmt(q.y, 2, lang)})` : '';
        const words = [t, coords].filter(Boolean).join(' ');
        if (words) kids.push(label(A.X(q.x) + 8, A.Y(q.y) - 12, words, { size: 13, colour: P.ink, halo: P.paper }));
      }
    }
    return frame(A.w, A.h, kids, { ...o, kind: 'grid' }, o.title || 'Coordinate grid');
  },
};

export const GRAPHS = { grid };
