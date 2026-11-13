// The Pro diagram pack (Number Quest grades 6-8): the cleaners for the drawn types views/nq-diagrams-pro.js draws.
//   plane          a coordinate plane (four quadrants or the first), points, segments, lines, polygons, a slope
//                  triangle; with steps and axis names it is a scatter plot with a trend line;
//   double         a double number line: two aligned scales, any value may be the blank "?";
//   boxplot        one or two box plots over one labelled axis;
//   angles         angles at one point: on a straight line, in a right angle, where two lines cross, or round a point;
//   righttriangle  a right triangle with its two legs and its hypotenuse labelled;
//   net            the net of a rectangular prism or of a triangular prism, with its edge lengths;
//   flow           an operation flow (a function machine chain), with the way back for inverse operations.
// The same contract as services/diagrams.js: strictly shaped per type, only known fields survive, every number is
// checked and every string capped. A diagram that would draw something false (a point off the plane, a label cut
// short, angles that do not add up) is dropped whole (null; fromDeck reports it), never drawn wrong. What is only a
// matter of drawing is clamped in the view instead (how many gridlines carry a number, how long and thin a triangle
// or a net may be drawn, where a label sits).
export const PRO_DIAGRAM_TYPES = Object.freeze(['plane', 'double', 'boxplot', 'angles', 'righttriangle', 'net', 'flow']);
export const ANGLE_LAYOUTS = Object.freeze(['line', 'corner', 'cross', 'rays']);
export const NET_SOLIDS = Object.freeze(['box', 'prism']);

const num = x => typeof x === 'number' && Number.isFinite(x);
const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const arr = (a, lo, hi) => Array.isArray(a) && a.length >= lo && a.length <= hi;
const obj = x => !!x && typeof x === 'object' && !Array.isArray(x);
/** The minus sign the decks print (U+2212), wherever a hyphen stands for "negative" or "subtract" in a label:
 *  before a number or a letter at the start, after a space, a bracket or an operator, and between spaces. */
export const minus = s => String(s).replace(/(^|[\s(=<>≤≥×÷+,])-(?=\s?[\d.a-z(])/gi, '$1−').replace(/ - /g, ' − ');
/** A number as a deck prints it: at most two decimals, the real minus sign, no "-0". */
export const fmt = n => { const r = Math.round(n * 100) / 100; return minus(String(Object.is(r, -0) ? 0 : r)); };
/** A label: a number (printed with fmt) or a string, whole. One that is empty or longer than `max` is not a label
 *  ('' here): a label is never cut short, because half a number teaches something false. */
const lab = (x, max) => {
  if (num(x)) { const s = fmt(x); return s.length <= max ? s : ''; }
  if (typeof x !== 'string') return '';
  const s = minus(x.trim().replace(/\s+/g, ' '));
  return s.length >= 1 && s.length <= max ? s : '';
};
/** An optional label: [ok, value]. Absent is fine; present and not a whole label is not. */
const opt = (x, max) => (x == null ? [true, ''] : [!!lab(x, max), lab(x, max)]);
const pt = p => arr(p, 2, 2) && num(p[0]) && num(p[1]);
const whole = x => Math.abs(x - Math.round(x)) < 1e-9;

function cleanPlane(v, label) {
  if (!arr(v.x, 2, 2) || !arr(v.y, 2, 2) || ![...v.x, ...v.y].every(n => num(n) && Math.abs(n) <= 9999)) return null;
  const [x0, x1] = v.x, [y0, y1] = v.y;
  if (!(x0 <= 0 && x1 >= 0 && x0 < x1 && y0 <= 0 && y1 >= 0 && y0 < y1)) return null; // both axes are on the plane
  const st = v.step == null ? [1, 1] : num(v.step) ? [v.step, v.step] : v.step;
  if (!arr(st, 2, 2) || !st.every(s => num(s) && s > 0)) return null;
  const nx = (x1 - x0) / st[0], ny = (y1 - y0) / st[1];
  // whole squares only, 2-20 across and 2-20 up, with both axes on a gridline
  if (!whole(nx) || !whole(ny) || nx < 2 || nx > 20.5 || ny < 2 || ny > 20.5 || !whole(x0 / st[0]) || !whole(y0 / st[1])) return null;
  const on = p => pt(p) && p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
  const tone = t => t == null || int(t, 0, 3);
  const [okX, xName] = opt(v.xName, 20), [okY, yName] = opt(v.yName, 20);
  if (!okX || !okY) return null;
  const out = { type: 'plane', label, x: [x0, x1], y: [y0, y1], ...(v.step != null ? { step: [st[0], st[1]] } : {}), ...(xName ? { xName } : {}), ...(yName ? { yName } : {}) };
  if (v.points != null) {
    if (!arr(v.points, 1, 16) || !v.points.every(p => obj(p) && on([p.x, p.y]) && opt(p.label, 12)[0] && tone(p.tone))) return null;
    out.points = v.points.map(p => ({ x: p.x, y: p.y, ...(p.label != null ? { label: lab(p.label, 12) } : {}), ...(p.tone != null ? { tone: p.tone } : {}), ...(p.open ? { open: true } : {}) }));
  }
  if (v.segments != null) {
    if (!arr(v.segments, 1, 6) || !v.segments.every(s => obj(s) && on(s.from) && on(s.to) && (s.from[0] !== s.to[0] || s.from[1] !== s.to[1]) && opt(s.label, 10)[0])) return null;
    out.segments = v.segments.map(s => ({ from: [...s.from], to: [...s.to], ...(s.label != null ? { label: lab(s.label, 10) } : {}), ...(s.dash ? { dash: true } : {}) }));
  }
  if (v.lines != null) {
    if (!arr(v.lines, 1, 3)) return null;
    const lines = [];
    for (const l of v.lines) {
      if (!obj(l) || !opt(l.label, 14)[0]) return null;
      const more = { ...(l.label != null ? { label: lab(l.label, 14) } : {}), ...(l.dash ? { dash: true } : {}) };
      if (l.through != null) {
        // a line through two points of the plane (the only way to write an upright line)
        if (l.m != null || l.b != null || !arr(l.through, 2, 2) || !l.through.every(on) || (l.through[0][0] === l.through[1][0] && l.through[0][1] === l.through[1][1])) return null;
        lines.push({ through: l.through.map(p => [...p]), ...more });
      } else {
        // y = m x + b: it has to cross the part of the plane that is drawn
        if (!num(l.m) || !num(l.b) || Math.abs(l.m) > 1000 || Math.abs(l.b) > 1e6) return null;
        const ya = l.m * x0 + l.b, yb = l.m * x1 + l.b;
        if (Math.max(ya, yb) < y0 || Math.min(ya, yb) > y1) return null;
        lines.push({ m: l.m, b: l.b, ...more });
      }
    }
    out.lines = lines;
  }
  if (v.polygons != null) {
    if (!arr(v.polygons, 1, 2) || !v.polygons.every(g => obj(g) && arr(g.pts, 3, 8) && g.pts.every(on)
      && (g.names == null || (arr(g.names, g.pts.length, g.pts.length) && g.names.every(n => lab(n, 3)))))) return null;
    out.polygons = v.polygons.map(g => ({ pts: g.pts.map(p => [...p]), ...(g.names ? { names: g.names.map(n => lab(n, 3)) } : {}), ...(g.image ? { image: true } : {}) }));
  }
  if (v.slope != null) {
    const s = v.slope;
    // a slope triangle needs a run and a rise: two points that are not level and not one above the other
    if (!obj(s) || !on(s.from) || !on(s.to) || s.from[0] === s.to[0] || s.from[1] === s.to[1] || !opt(s.rise, 10)[0] || !opt(s.run, 10)[0]) return null;
    out.slope = { from: [...s.from], to: [...s.to], ...(s.rise != null ? { rise: lab(s.rise, 10) } : {}), ...(s.run != null ? { run: lab(s.run, 10) } : {}) };
  }
  return out;
}

function cleanDouble(v, label) {
  if (!arr(v.ticks, 2, 7)) return null;
  // a value is printed whole: up to 7 characters on a line of 2-5 values, up to 5 on a line of 6 or 7
  const max = v.ticks.length <= 5 ? 7 : 5;
  if (!v.ticks.every(t => arr(t, 2, 2) && lab(t[0], max) && lab(t[1], max))) return null;
  const [okT, top] = opt(v.top, 24), [okB, bottom] = opt(v.bottom, 24);
  if (!okT || !okB) return null;
  return { type: 'double', label, ...(top ? { top } : {}), ...(bottom ? { bottom } : {}), ticks: v.ticks.map(t => [lab(t[0], max), lab(t[1], max)]) };
}

function cleanBoxplot(v, label) {
  if (!num(v.min) || !num(v.max) || !num(v.step) || v.min >= v.max || v.step <= 0 || Math.abs(v.min) > 99999 || Math.abs(v.max) > 99999) return null;
  const n = (v.max - v.min) / v.step;
  if (!whole(n) || n < 2 || n > 12.5) return null;
  const five = f => arr(f, 5, 5) && f.every(num) && f[0] >= v.min && f[4] <= v.max && f.every((x, i) => !i || x >= f[i - 1]);
  if (!arr(v.plots, 1, 2) || !v.plots.every(p => obj(p) && five(p.five) && opt(p.name, 16)[0] && (p.tone == null || int(p.tone, 0, 3)))) return null;
  const [okU, unit] = opt(v.unit, 24);
  if (!okU) return null;
  return { type: 'boxplot', label, min: v.min, max: v.max, step: v.step, ...(unit ? { unit } : {}),
    plots: v.plots.map(p => ({ five: [...p.five], ...(p.name != null ? { name: lab(p.name, 16) } : {}), ...(p.tone != null ? { tone: p.tone } : {}) })) };
}

function cleanAngles(v, label) {
  if (!ANGLE_LAYOUTS.includes(v.layout) || !Array.isArray(v.angles)) return null;
  const a = v.angles, sum = a.reduce((t, q) => t + (q && num(q.deg) ? q.deg : NaN), 0), near = (x, y) => Math.abs(x - y) < 0.01;
  // every angle is wide enough to carry its measure (20 degrees or more) and is written whole
  if (!a.every(q => obj(q) && num(q.deg) && q.deg >= 20 && q.deg <= 340 && opt(q.label, 9)[0])) return null;
  if (v.layout === 'line' && !(a.length >= 2 && a.length <= 4 && near(sum, 180))) return null;
  if (v.layout === 'corner' && !(a.length >= 2 && a.length <= 3 && near(sum, 90))) return null;
  // two lines that cross: four angles going round, opposite ones equal, neighbours making a straight line
  if (v.layout === 'cross' && !(a.length === 4 && near(a[0].deg, a[2].deg) && near(a[1].deg, a[3].deg) && near(a[0].deg + a[1].deg, 180))) return null;
  if (v.layout === 'rays' && !(a.length >= 1 && a.length <= 5 && sum <= 360.01)) return null;
  return { type: 'angles', label, layout: v.layout, angles: a.map(q => ({ deg: q.deg, ...(q.label != null ? { label: lab(q.label, 9) } : {}), ...(q.blank ? { blank: true } : {}) })) };
}

function cleanRightTriangle(v, label) {
  if (!num(v.base) || !num(v.height) || v.base <= 0 || v.height <= 0 || v.base > 1e6 || v.height > 1e6) return null;
  const L = v.labels;
  if (!obj(L) || !['base', 'height', 'hyp'].every(k => opt(L[k], 9)[0]) || ['base', 'height', 'hyp'].filter(k => L[k] != null).length < 2) return null;
  if (v.corner != null && v.corner !== 'left' && v.corner !== 'right') return null;
  return { type: 'righttriangle', label, base: v.base, height: v.height, ...(v.corner === 'right' ? { corner: 'right' } : {}),
    labels: Object.fromEntries(['base', 'height', 'hyp'].filter(k => L[k] != null).map(k => [k, lab(L[k], 9)])) };
}

function cleanNet(v, label) {
  if (!NET_SOLIDS.includes(v.solid) || !arr(v.dims, 3, 3) || !v.dims.every(d => num(d) && d > 0 && d <= 1000)) return null;
  if (v.labels != null && !(arr(v.labels, 3, 3) && v.labels.every(s => lab(s, 7)))) return null;
  return { type: 'net', label, solid: v.solid, dims: [...v.dims], ...(v.labels ? { labels: v.labels.map(s => lab(s, 7)) } : {}) };
}

function cleanFlow(v, label) {
  if (!arr(v.ops, 1, 3) || !arr(v.values, v.ops.length + 1, v.ops.length + 1)) return null;
  // three machines leave room for 4 characters a label; one or two leave room for 6
  const max = v.ops.length === 3 ? 4 : 6;
  if (!v.ops.every(o => lab(o, max)) || !v.values.every(x => lab(x, max))) return null;
  if (v.undo != null && !(arr(v.undo, v.ops.length, v.ops.length) && v.undo.every(o => lab(o, max)))) return null;
  const [okI, inName] = opt(v.inName, 8), [okO, outName] = opt(v.outName, 8);
  if (!okI || !okO) return null;
  return { type: 'flow', label, values: v.values.map(x => lab(x, max)), ops: v.ops.map(o => lab(o, max)), ...(v.undo ? { undo: v.undo.map(o => lab(o, max)) } : {}),
    ...(inName ? { inName } : {}), ...(outName ? { outName } : {}) };
}

const CLEAN = { plane: cleanPlane, double: cleanDouble, boxplot: cleanBoxplot, angles: cleanAngles, righttriangle: cleanRightTriangle, net: cleanNet, flow: cleanFlow };
/** One cleaned Pro diagram or null. Never throws, whatever it is handed. */
export function cleanProDiagram(v, label) {
  try { return label && obj(v) && Object.hasOwn(CLEAN, v.type) ? CLEAN[v.type](v, label) : null; } catch { return null; }
}

/** The options the Pro pack adds to the number line (cleaned here, called by services/courses.js cleanSlide with the
 *  line it has already checked): `upright` stands the line up (a thermometer with `tube`), with its hops drawn as
 *  arrows up and down; `ray` shades every number from `at` to one end, with an open or a closed circle at `at` (an
 *  inequality). -> the fields to add ({} for none), or null when one is malformed. */
export function numberlineOptions(v) {
  const out = {};
  if (v.upright != null && v.upright !== false) {
    // an upright line has no line plot, hop labels of up to 5 characters, and marks far enough apart to read
    if (v.upright !== true || v.stacks != null || v.ray != null || (v.hops || []).some(h => String(h.label).trim().length > 5)) return null;
    out.upright = true;
    if (v.tube != null && v.tube !== false) { if (v.tube !== true) return null; out.tube = true; }
  } else if (v.tube != null && v.tube !== false) return null;
  if (v.ray != null) {
    const r = v.ray;
    if (!obj(r) || !num(r.at) || r.at < v.min || r.at > v.max || (r.dir !== 'left' && r.dir !== 'right') || (r.open != null && typeof r.open !== 'boolean')) return null;
    if ((r.dir === 'right' && r.at === v.max) || (r.dir === 'left' && r.at === v.min)) return null; // a ray needs room to run
    out.ray = { at: r.at, dir: r.dir, ...(r.open ? { open: true } : {}) };
  }
  return out;
}
