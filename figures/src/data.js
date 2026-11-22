// Oomba Figures: data displays. A bar graph (one series, double or more, side by side or stacked), a dot plot, a
// histogram (equal bins, or unequal bins drawn as frequency density so every bar's area is its frequency), box plots
// (one or several on one axis, outliers past 1.5 IQR), a scatter plot with the least-squares line, a stem-and-leaf
// plot with its key, a pie chart, a cumulative frequency graph with its readings, and a normal curve with shaded areas.
// Every chart is drawn from its data: a bar's height, a box's quartiles, a slice's angle and a region's area are worked
// out, never typed in, and a label or summary that states a number must be the true one. The statistics are
// ported/stats.js; the drawing is Oomba's own. In print, series are told apart by fills that photocopy (gray, white,
// hatching, dots, cross-hatching), never by color alone.
import { node, label, line, poly, frame, palette, seriesColour, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { mathBox, mathNode, mathProblem, mathValue, mathText } from './mathtext.js';
import { niceText } from './ported/numbering.js';
import { stSummary, stMedian, stOutliers, stNiceRange, stCount, stPhi, stCdf, stFit, stCorrelation, stSmooth } from './ported/stats.js';

// ---------------------------------------------------------------- shared pieces
export const ddClean = v => Number(Number(v).toPrecision(12)) || 0;
/** A value: a number, or a fraction [n, d]. */
export const ddV = v => (isNum(v, -1e9, 1e9) ? v : Array.isArray(v) && v.length === 2 && Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[1] > 0 ? v[0] / v[1] : null);
export const ddTextW = (s, size) => String(s).length * size * 0.6;
const ddDp = step => { const s = String(ddClean(step)); return /e/.test(s) ? 6 : s.includes('.') ? s.split('.')[1].length : 0; };
/** A data display's keys: the ones it takes, and the shared ones. -> the first problem, or null. */
export function ddOdd(d, keys, kind) {
  const all = ['kind', 'hide', 'heading', ...keys], odd = Object.keys(d).filter(k => !all.includes(k));
  return odd.length ? `${kind} does not take "${odd[0]}" (it takes ${['heading', ...keys].join(', ')})` : null;
}
export function ddTexts(d, out, keys = ['heading', 'xtitle', 'ytitle']) {
  for (const k of keys) if (d[k] !== undefined && (typeof d[k] !== 'string' || d[k].length > 60)) out.push(`"${k}" must be short text (60 characters at most)`);
}
/** The axis from `from` to `to` every `step` (any left out are fitted to lo..hi; zero: it starts at 0). Problems into out. */
export function ddRange(given, lo, hi, out, what = 'the axis', o = {}) {
  const { from, to, step } = given;
  for (const [k, v] of [['from', from], ['to', to], ['step', step]]) if (v !== undefined && ddV(v) === null) { out.push(`${what}: "${k}" must be a number`); return null; }
  const a = o.zero ? Math.min(0, lo) : lo, auto = stNiceRange(a, Math.max(hi, a + 1e-9));
  const s = step !== undefined ? ddV(step) : auto.step;
  if (!(s > 0)) { out.push(`${what}: "step" must be above 0`); return null; }
  const f = from !== undefined ? ddV(from) : o.zero && a >= 0 ? 0 : ddClean(Math.floor(a / s + 1e-9) * s);
  let t = to !== undefined ? ddV(to) : ddClean(Math.ceil(hi / s - 1e-9) * s);
  if (to === undefined && t <= f) t = ddClean(f + s);
  if (!(t > f)) { out.push(`${what}: "to" must be past "from"`); return null; }
  const n = (t - f) / s;
  if (Math.abs(n - Math.round(n)) > 1e-6) { out.push(`${what} must end on a step: from ${fmt(f, 6)} to ${fmt(t, 6)} is not a whole number of steps of ${fmt(s, 6)}`); return null; }
  if (Math.round(n) > (o.max || 40)) { out.push(`${what} has ${Math.round(n)} steps: at most ${o.max || 40} (use a bigger "step")`); return null; }
  if (lo < f - 1e-9 || hi > t + 1e-9) { out.push(`${what} runs from ${fmt(f, 6)} to ${fmt(t, 6)}, but the data runs from ${fmt(lo, 6)} to ${fmt(hi, 6)}: widen it (a figure never leaves data off)`); return null; }
  return { from: ddClean(f), to: ddClean(t), step: ddClean(s), n: Math.round(n) };
}
export const ddTicks = r => Array.from({ length: r.n + 1 }, (_, k) => ddClean(r.from + k * r.step));
/** Fills that tell series apart: the series colors on screen; in print gray, white, hatching, dots, cross-hatching and
 *  back hatching (patterns defined once per figure, under an id made from its data so two figures never clash). */
const DD_PRINT = ['#BDBDBD', '#FFFFFF', 'hatch', 'dots', 'cross', 'back'];
export function ddPaints(o, d, kind) {
  let h = 2166136261; for (const c of `${kind}${JSON.stringify(d)}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const id = `of-${kind}-${h.toString(36)}`, used = new Set();
  const fill = i => { if (!o.print) return seriesColour(o, i); const f = DD_PRINT[((i % 6) + 6) % 6]; if (f.startsWith('#')) return f; used.add(f); return `url(#${id}-${f})`; };
  const defs = () => (used.size ? node('defs', {}, [...used].map(f => node('pattern', { id: `${id}-${f}`, width: 8, height: 8, patternUnits: 'userSpaceOnUse' },
    node('rect', { width: 8, height: 8, fill: '#FFFFFF' }),
    f === 'dots' ? node('circle', { cx: 4, cy: 4, r: 1.6, fill: '#000000' }) : null,
    f === 'hatch' || f === 'cross' ? [node('path', { d: 'M-2,2 L2,-2 M0,8 L8,0 M6,10 L10,6', stroke: '#000000', 'stroke-width': 1.2 })] : null,
    f === 'back' || f === 'cross' ? [node('path', { d: 'M-2,6 L2,10 M0,0 L8,8 M6,-2 L10,2', stroke: '#000000', 'stroke-width': 1.2 })] : null))) : null);
  return { fill, defs };
}
/** A number written for the reader: decimals, or a fraction when the data was given as fractions. */
const ddNum = (v, lang, numbering, dp = 2) => (numbering === 'fraction' ? niceText(v, 'fraction', lang) : fmt(v, dp, lang));
/** A label that states a number must state this value (within half the last place it writes). -> null or why not. */
export function ddClaim(l, value, what) {
  if (l === undefined || l === true || l === false) return null;
  const why = mathProblem(l, `the label of ${what}`); if (why) return why;
  // a number with a percent or degree sign states that number ("5%", "40°")
  const bare = typeof l === 'string' ? l.trim().replace(/\s*[%°]$/, '') : l, v = mathValue(bare);
  if (v === null) return null;
  const s = typeof bare === 'number' ? String(bare) : typeof bare === 'string' ? bare : '', dps = s.includes('.') ? s.split('.')[1].length : 0;
  return Math.abs(v - value) <= 0.5 * 10 ** -dps + 1e-9 * Math.max(1, Math.abs(value)) ? null : `${what} is labeled ${mathText(l)} but it is ${fmt(value, 4)}: a label that states a number must state the true value`;
}
/** Cartesian axes along the bottom and left: { X, Y, kids, W, H, L, T, w, h }. s: { x: range | null (categories), y,
 *  w, h, xfmt, yfmt, heading, xtitle, ytitle, gridX, ynums, xnums, extraR, extraB }. */
export function ddCart(o, s) {
  const P = palette(o), yt = s.y ? ddTicks(s.y) : [], xt = s.x ? ddTicks(s.x) : [];
  const ynums = s.ynums !== false, ylabW = ynums ? Math.max(12, ...yt.map(v => ddTextW(s.yfmt(v), 12))) : 0;
  const L = 16 + (s.ytitle ? 24 : 0) + ylabW + 10, T = 18 + (s.heading ? 30 : 0), B = 34 + (s.xtitle ? 26 : 0) + (s.extraB || 0), R = 24 + (s.extraR || 0);
  const w = s.w || 440, h = s.h || 280;
  const X = s.x ? v => L + ((v - s.x.from) / (s.x.to - s.x.from)) * w : v => L + v * w, Y = v => T + h - ((v - s.y.from) / (s.y.to - s.y.from)) * h;
  const kids = [], grid = [];
  for (const v of yt) if (v !== s.y.from) grid.push(line(L, Y(v), L + w, Y(v), P.grid, 1));
  if (s.gridX) for (const v of xt) if (v !== s.x.from) grid.push(line(X(v), T, X(v), T + h, P.grid, 1));
  kids.push(node('g', { 'aria-hidden': 'true', class: 'of-gridlines' }, grid));
  kids.push(line(L, T + h, L + w + 6, T + h, P.ink, 2), line(L, T + h, L, T - 6, P.ink, 2));
  for (const v of yt) { kids.push(line(L - 5, Y(v), L, Y(v), P.ink, 1.5)); if (ynums) kids.push(label(L - 9, Y(v), s.yfmt(v), { anchor: 'end', size: 12, weight: 600, colour: P.ink2, cls: 'of-num' })); }
  if (s.x) for (const v of xt) { kids.push(line(X(v), T + h, X(v), T + h + 5, P.ink, 1.5)); if (s.xnums !== false) kids.push(label(X(v), T + h + 17, s.xfmt(v), { anchor: 'middle', size: 12, weight: 600, colour: P.ink2, cls: 'of-num' })); }
  const W = L + w + R, H = T + h + B;
  if (s.heading) kids.push(label(W / 2, 24, s.heading, { anchor: 'middle', size: 16, colour: P.ink, cls: 'of-heading' }));
  if (s.xtitle) kids.push(label(L + w / 2, H - 14, s.xtitle, { anchor: 'middle', size: 13, colour: P.ink, cls: 'of-axis-title' }));
  if (s.ytitle) kids.push(node('g', { transform: `translate(18 ${r2(T + h / 2)}) rotate(-90)` }, label(0, 0, s.ytitle, { anchor: 'middle', size: 13, colour: P.ink, cls: 'of-axis-title' })));
  return { X, Y, kids, W, H, L, T, w, h };
}
/** A number line along the bottom (dot plots, box plots): ticks every step, numbers on them, arrows at both ends. */
function ddLine(o, r, y, L, w, fmtV) {
  const P = palette(o), X = v => L + ((v - r.from) / (r.to - r.from)) * w, kids = [line(L - 16, y, L + w + 16, y, P.ink, 2)];
  kids.push(node('polygon', { points: `${r2(L - 24)},${r2(y)} ${r2(L - 14)},${r2(y - 5)} ${r2(L - 14)},${r2(y + 5)}`, fill: P.ink }), node('polygon', { points: `${r2(L + w + 24)},${r2(y)} ${r2(L + w + 14)},${r2(y - 5)} ${r2(L + w + 14)},${r2(y + 5)}`, fill: P.ink }));
  for (const v of ddTicks(r)) kids.push(line(X(v), y - 6, X(v), y + 6, P.ink, 1.6), label(X(v), y + 20, fmtV(v), { anchor: 'middle', size: 13, weight: 600, colour: P.ink2, cls: 'of-num' }));
  return { X, kids };
}
/** A small key: a swatch and a name for each series, from (x, y) down. */
function ddKey(o, items, x, y) {
  const P = palette(o);
  return node('g', { class: 'of-key' }, items.map((it, i) => [node('rect', { x, y: y + i * 22 - 7, width: 14, height: 14, fill: it.fill, stroke: P.ink, 'stroke-width': 1.2 }), label(x + 20, y + i * 22, it.name, { size: 13, colour: P.ink })]));
}
/** The figure: a frame of w x h with the paints' patterns in it. */
const ddFrame = (w, h, kids, o, kind, name, paints) => frame(w, h, [paints ? paints.defs() : null, kids], { ...o, kind }, name);
/** Summary statistics of a list (for OF.solve). */
export function ddStats(values) {
  const n = values.length, s = [...values].sort((a, b) => a - b), sum = s.reduce((t, v) => t + v, 0), five = stSummary(s);
  const freq = new Map(); for (const v of s) freq.set(v, (freq.get(v) || 0) + 1);
  const top = Math.max(...freq.values()), mode = top > 1 ? [...freq.entries()].filter(([, c]) => c === top).map(([v]) => v) : [];
  return { n, sum: ddClean(sum), mean: ddClean(sum / n), median: five.median, mode, min: five.min, max: five.max, range: ddClean(five.max - five.min), q1: five.q1, q3: five.q3, iqr: ddClean(five.q3 - five.q1) };
}
const ddNumList = (v, at, out, o = {}) => {
  if (!Array.isArray(v) || v.length < (o.min || 1) || v.length > (o.max || 200)) { out.push(`${at} must list ${o.min || 1} to ${o.max || 200} numbers`); return null; }
  const vals = v.map(ddV);
  const bad = vals.findIndex(x => x === null || (o.pos && x < 0));
  if (bad >= 0) { out.push(`${at}: item ${bad + 1} must be a number${o.pos ? ' 0 or more' : ''} (or a fraction [n, d])`); return null; }
  return vals;
};
const ddCount = v => Number.isInteger(v) && v >= 0 && v <= 1e6;

// ---------------------------------------------------------------- bar graph
const BAR_KEYS = ['categories', 'values', 'series', 'stacked', 'direction', 'from', 'to', 'step', 'labels', 'xtitle', 'ytitle'];
function barRead(d) {
  const out = [], odd = ddOdd(d, BAR_KEYS, 'barGraph'); if (odd) return { problems: [odd] };
  ddTexts(d, out);
  if (!Array.isArray(d.categories) || d.categories.length < 1 || d.categories.length > 12 || d.categories.some(c => !text(c, 30))) return { problems: [...out, '"categories" must list 1 to 12 names, like ["Soccer", "Tennis"]'] };
  const cats = d.categories.map(c => text(c, 30));
  if (new Set(cats).size !== cats.length) out.push('the categories must have different names');
  if ((d.values === undefined) === (d.series === undefined)) return { problems: [...out, 'give "values" (one number for each category) or "series" ([{ "name", "values" }], for a double bar graph), not both'] };
  const list = d.series !== undefined ? d.series : [{ name: '', values: d.values }];
  if (!Array.isArray(list) || list.length < 1 || list.length > 5) return { problems: [...out, '"series" must list 1 to 5 series, like [{ "name": "Boys", "values": [3, 5] }]'] };
  const series = list.map((s, i) => {
    const at = d.series ? `series ${i + 1}` : 'the bar graph';
    if (!s || typeof s !== 'object') { out.push(`${at} must be { "name", "values" }`); return null; }
    if (d.series && !text(s.name, 30)) out.push(`${at} needs a "name" (the key says which bars are which)`);
    const v = Array.isArray(s.values) && s.values.length === cats.length ? s.values.map(x => (isNum(x, 0, 1e9) ? x : null)) : null;
    if (!v || v.some(x => x === null)) { out.push(`${at}: "values" must list ${cats.length} numbers 0 or more, one for each category`); return null; }
    return { name: text(s.name, 30), values: v };
  });
  if (out.length) return { problems: out };
  if (d.stacked !== undefined && typeof d.stacked !== 'boolean') out.push('"stacked" must be true or false');
  if (d.direction !== undefined && !['columns', 'bars'].includes(d.direction)) out.push('"direction" must be "columns" (upright) or "bars" (across)');
  const tops = cats.map((_, k) => (d.stacked ? series.reduce((t, s) => t + s.values[k], 0) : Math.max(...series.map(s => s.values[k]))));
  if (d.from !== undefined && d.from !== 0) return { problems: [...out, 'the value axis of a bar graph must start at 0 (a bar\'s length is its value)'] };
  const r = ddRange(d, 0, Math.max(...tops, 1e-9), out, 'the value axis', { zero: true });
  if (d.labels !== undefined) {
    if (!d.labels || typeof d.labels !== 'object' || Array.isArray(d.labels)) out.push('"labels" must be { "category": a label }, like { "Tennis": "x" }');
    else if (series.length > 1) out.push('"labels" are for a bar graph with one series');
    else for (const [k, l] of Object.entries(d.labels)) { const i = cats.indexOf(k); if (i < 0) out.push(`labels: "${k}" is not one of the categories`); else { const why = ddClaim(l, series[0].values[i], `the ${k} bar`); if (why) out.push(why); } }
  }
  if (out.length) return { problems: out };
  return { problems: [], cats, series, range: r, stacked: !!d.stacked, across: d.direction === 'bars' };
}
export const barGraph = {
  check(d) { return barRead(d).problems; },
  /** Each category's value (or total, with several series), the total, mean, median, mode, range, the largest and
   *  smallest category, and each series' values and total. */
  solve(d) {
    const r = barRead(d); if (r.problems.length) return null;
    const totals = r.cats.map((_, k) => ddClean(r.series.reduce((t, s) => t + s.values[k], 0))), st = ddStats(totals);
    const big = Math.max(...totals), small = Math.min(...totals);
    return { categories: r.cats, values: Object.fromEntries(r.cats.map((c, k) => [c, totals[k]])), total: st.sum, mean: st.mean, median: st.median, mode: st.mode, range: st.range, max: big, min: small,
      most: r.cats.filter((_, k) => totals[k] === big), least: r.cats.filter((_, k) => totals[k] === small), series: r.series.map(s => ({ name: s.name, values: s.values, total: ddClean(s.values.reduce((t, v) => t + v, 0)) })) };
  },
  draw(d, o) {
    const r = barRead(d), P = palette(o), lang = o.lang, W = figWords(lang), paints = ddPaints(o, d, 'barGraph');
    const m = r.series.length, n = r.cats.length, grouped = m > 1 && !r.stacked, showVals = !hides(o, 'values') && o.hide !== true;
    const nameW = Math.max(...r.cats.map(c => ddTextW(c, 13))), keyW = m > 1 ? 30 + Math.max(...r.series.map(s => ddTextW(s.name, 13))) : 0;
    const fv = v => fmt(v, ddDp(r.range.step), lang);
    const kids = [];
    let C;
    if (!r.across) C = ddCart(o, { x: null, y: r.range, w: Math.max(260, n * (grouped ? 26 * m + 30 : 64)), h: 260, yfmt: fv, heading: text(d.heading, 60), xtitle: text(d.xtitle, 60), ytitle: text(d.ytitle, 60), extraR: keyW });
    else {
      // bars across: the value axis along the bottom, the categories down the left
      const vr = r.range, L = 20 + (d.ytitle ? 24 : 0) + nameW + 10, T = 18 + (d.heading ? 30 : 0), w = 420, h = Math.max(160, n * (grouped ? 22 * m + 18 : 44));
      const X = v => L + ((v - vr.from) / (vr.to - vr.from)) * w, Wd = L + w + 24 + keyW, Hd = T + h + 34 + (d.xtitle ? 26 : 0);
      const ks = [node('g', { 'aria-hidden': 'true', class: 'of-gridlines' }, ddTicks(vr).filter(v => v !== vr.from).map(v => line(X(v), T, X(v), T + h, P.grid, 1)))];
      ks.push(line(L, T + h, L + w + 6, T + h, P.ink, 2), line(L, T + h, L, T - 6, P.ink, 2));
      for (const v of ddTicks(vr)) ks.push(line(X(v), T + h, X(v), T + h + 5, P.ink, 1.5), label(X(v), T + h + 17, fv(v), { anchor: 'middle', size: 12, weight: 600, colour: P.ink2, cls: 'of-num' }));
      if (d.heading) ks.push(label(Wd / 2, 24, text(d.heading, 60), { anchor: 'middle', size: 16, colour: P.ink, cls: 'of-heading' }));
      if (d.xtitle) ks.push(label(L + w / 2, Hd - 14, text(d.xtitle, 60), { anchor: 'middle', size: 13, colour: P.ink, cls: 'of-axis-title' }));
      if (d.ytitle) ks.push(node('g', { transform: `translate(18 ${r2(T + h / 2)}) rotate(-90)` }, label(0, 0, text(d.ytitle, 60), { anchor: 'middle', size: 13, colour: P.ink, cls: 'of-axis-title' })));
      C = { X, Y: null, kids: ks, W: Wd, H: Hd, L, T, w, h };
    }
    kids.push(...C.kids);
    const slot = (r.across ? C.h : C.w) / n, share = grouped ? Math.min(0.8, 0.3 + 0.15 * m) : 0.6;
    const V = v => (r.across ? C.X(v) - C.X(0) : C.Y(0) - C.Y(v));
    r.cats.forEach((cat, k) => {
      const mid = (r.across ? C.T : C.L) + slot * (k + 0.5), bw = (slot * share) / (grouped ? m : 1);
      if (r.across) kids.push(label(C.L - 8, mid, cat, { anchor: 'end', size: 13, colour: P.ink, cls: 'of-category' }));
      else kids.push(label(mid, C.T + C.h + 17, cat, { anchor: 'middle', size: 13, colour: P.ink, cls: 'of-category' }));
      if (hides(o, cat)) return;   // a bar left for the student to draw
      let base = 0;
      r.series.forEach((s, i) => {
        const v = s.values[k], len = V(v), off = grouped ? (i - (m - 1) / 2) * bw : 0, b0 = V(base);
        const rect = r.across ? { x: C.L + b0, y: mid + off - bw / 2, width: Math.max(0, len), height: bw } : { x: mid + off - bw / 2, y: C.T + C.h - b0 - len, width: bw, height: Math.max(0, len) };
        kids.push(node('rect', { ...rect, fill: paints.fill(i), stroke: P.ink, 'stroke-width': 1.4, class: 'of-bar', 'data-category': cat, 'data-value': v }));
        const l = m === 1 && d.labels && d.labels[cat] !== undefined ? d.labels[cat] : true;
        if (showVals && r.stacked && m > 1 && len >= 18 && v > 0) kids.push(label(r.across ? C.L + b0 + len / 2 : mid + off, r.across ? mid + off : C.T + C.h - b0 - len / 2, fmt(v, 3, lang), { anchor: 'middle', size: 13, colour: P.ink, halo: o.print ? '#FFFFFF' : P.paper, cls: 'of-value' }));
        else if (showVals && l !== false && (!r.stacked || m === 1)) {
          const bx = l === true ? null : mathBox(l, 15, { lang });
          if (l === true) kids.push(r.across ? label(C.L + b0 + len + 6, mid + off, fmt(v, 3, lang), { size: 13, colour: P.ink, cls: 'of-value' }) : label(mid + off, C.T + C.h - b0 - len - 10, fmt(v, 3, lang), { anchor: 'middle', size: 13, colour: P.ink, cls: 'of-value' }));
          else if (bx) kids.push(r.across ? mathNode(bx, C.L + b0 + len + 6, mid + off + (bx.asc - bx.desc) / 2, { color: P.ink, cls: 'of-value' }) : mathNode(bx, mid + off - bx.w / 2, C.T + C.h - b0 - len - 6 - bx.desc, { color: P.ink, cls: 'of-value' }));
        }
        if (r.stacked) base += v;
      });
    });
    if (m > 1) kids.push(ddKey(o, r.series.map((s, i) => ({ name: s.name, fill: paints.fill(i) })), C.L + C.w + 30, C.T + 10));
    return ddFrame(C.W, C.H, kids, o, 'barGraph', o.title || text(d.heading, 60) || W('barGraph'), paints);
  },
};

// ---------------------------------------------------------------- dot plot
const DOT_KEYS = ['data', 'counts', 'from', 'to', 'step', 'mark', 'numbering', 'xtitle'];
function dotRead(d) {
  const out = [], odd = ddOdd(d, DOT_KEYS, 'dotPlot'); if (odd) return { problems: [odd] };
  ddTexts(d, out, ['heading', 'xtitle']);
  if ((d.data === undefined) === (d.counts === undefined)) return { problems: [...out, 'give "data" (the values) or "counts" ([[value, how many], ...], a frequency table), not both'] };
  let values;
  if (d.data !== undefined) values = ddNumList(d.data, '"data"', out, { max: 100 });
  else if (!Array.isArray(d.counts) || d.counts.length < 1 || d.counts.length > 40 || d.counts.some(c => !Array.isArray(c) || c.length !== 2 || ddV(c[0]) === null || !ddCount(c[1]))) out.push('"counts" must list [value, how many] pairs, like [[1, 3], [2, 5]], with whole counts');
  else values = d.counts.flatMap(([v, c]) => Array(c).fill(ddV(v)));
  if (!values) return { problems: out };
  if (!values.length || values.length > 100) return { problems: [...out, 'a dot plot shows 1 to 100 values'] };
  if (d.mark !== undefined && !['dot', 'x'].includes(d.mark)) out.push('"mark" must be "dot" or "x"');
  if (d.numbering !== undefined && !['decimal', 'fraction'].includes(d.numbering)) out.push('"numbering" must be "decimal" or "fraction"');
  const fr = [d.from, d.to, d.step].some(Array.isArray) || (Array.isArray(d.data) && d.data.some(Array.isArray)) || (Array.isArray(d.counts) && d.counts.some(c => Array.isArray(c) && Array.isArray(c[0])));
  const lo = Math.min(...values), hi = Math.max(...values);
  const r = ddRange({ from: d.from, to: d.to, step: d.step !== undefined ? d.step : values.every(Number.isInteger) && hi - lo <= 30 ? 1 : undefined }, lo, hi, out, 'the number line');
  if (!r || out.length) return { problems: out };
  const off = values.find(v => Math.abs((v - r.from) / r.step - Math.round((v - r.from) / r.step)) > 1e-6);
  if (off !== undefined) return { problems: [`the value ${fmt(off, 4)} is not on a tick of the number line (from ${fmt(r.from, 4)} every ${fmt(r.step, 4)}): a dot must sit on a tick to be read`] };
  const counts = new Map(); for (const v of values) { const k = Math.round((v - r.from) / r.step); counts.set(k, (counts.get(k) || 0) + 1); }
  if (Math.max(...counts.values()) > 20) return { problems: ['at most 20 dots in one column'] };
  return { problems: [], values, r, counts, numbering: d.numbering || (fr ? 'fraction' : 'decimal'), mark: d.mark || 'dot' };
}
export const dotPlot = {
  check(d) { return dotRead(d).problems; },
  /** n, mean, median, mode, range, min, max, quartiles and IQR, and how many of each value. */
  solve(d) { const r = dotRead(d); if (r.problems.length) return null; return { ...ddStats(r.values), counts: [...r.counts.entries()].sort((a, b) => a[0] - b[0]).map(([k, c]) => [ddClean(r.r.from + k * r.r.step), c]) }; },
  draw(d, o) {
    const r = dotRead(d), P = palette(o), lang = o.lang, W = figWords(lang), top = Math.max(...r.counts.values());
    const w = Math.min(520, Math.max(420, r.r.n * 40)), gap = Math.min(22, w / r.r.n * 0.8), L = 40, T = 18 + (d.heading ? 30 : 0), y = T + 12 + Math.max(4, top) * gap, kids = [];
    const N = ddLine(o, r.r, y, L, w, v => ddNum(v, lang, r.numbering, 3));
    kids.push(...N.kids);
    if (o.hide !== true && !hides(o, 'data')) for (const [k, c] of r.counts) for (let i = 0; i < c; i++) {
      const x = N.X(r.r.from + k * r.r.step), cy = y - 14 - i * gap, s = gap * 0.32;
      kids.push(r.mark === 'x' ? node('path', { d: `M${r2(x - s)},${r2(cy - s)} L${r2(x + s)},${r2(cy + s)} M${r2(x - s)},${r2(cy + s)} L${r2(x + s)},${r2(cy - s)}`, stroke: P.blue, 'stroke-width': 2.4, 'stroke-linecap': 'round', class: 'of-mark' })
        : node('circle', { cx: x, cy, r: s + 1, fill: P.blue, class: 'of-mark' }));
    }
    const Wd = L + w + 40, Hd = y + 36 + (d.xtitle ? 26 : 0);
    if (d.heading) kids.push(label(Wd / 2, 24, text(d.heading, 60), { anchor: 'middle', size: 16, colour: P.ink, cls: 'of-heading' }));
    if (d.xtitle) kids.push(label(L + w / 2, Hd - 14, text(d.xtitle, 60), { anchor: 'middle', size: 13, colour: P.ink, cls: 'of-axis-title' }));
    return ddFrame(Wd, Hd, kids, o, 'dotPlot', o.title || text(d.heading, 60) || W('dotPlot'));
  },
};

// ---------------------------------------------------------------- histogram
const HIST_KEYS = ['bins', 'counts', 'data', 'holds', 'density', 'polygon', 'step', 'ystep', 'xtitle', 'ytitle'];
/** Bins [[lo, hi], ...] in order, each starting where the one before ends. -> the bins, or null (problems into out). */
function ddBins(b, out) {
  if (!Array.isArray(b) || b.length < 1 || b.length > 20 || b.some(x => !Array.isArray(x) || x.length !== 2 || ddV(x[0]) === null || ddV(x[1]) === null || !(ddV(x[1]) > ddV(x[0])))) { out.push('"bins" must list 1 to 20 bins [from, to], like [[0, 10], [10, 20]]'); return null; }
  const bins = b.map(x => [ddV(x[0]), ddV(x[1])]);
  for (let i = 1; i < bins.length; i++) if (Math.abs(bins[i][0] - bins[i - 1][1]) > 1e-9) { out.push(`bin ${i + 1} must start where bin ${i} ends (${fmt(bins[i - 1][1], 4)}): no gaps, no overlaps`); return null; }
  return bins;
}
function ddBinned(d, out, kind) {
  const bins = ddBins(d.bins, out); if (!bins) return null;
  if (d.holds !== undefined && !['left', 'right'].includes(d.holds)) out.push('"holds" must be "left" (10 ≤ x < 20) or "right" (10 < x ≤ 20): which bin a value on an edge goes in');
  let counts = null;
  if (d.counts !== undefined) {
    if (!Array.isArray(d.counts) || d.counts.length !== bins.length || !d.counts.every(ddCount)) { out.push(`"counts" must list ${bins.length} whole numbers 0 or more, one for each bin`); return null; }
    counts = d.counts.slice();
  }
  if (d.data !== undefined) {
    const vals = ddNumList(d.data, '"data"', out, { max: 500 }); if (!vals) return null;
    const c = stCount(vals, bins, d.holds || 'left');
    if (c.outside.length) { out.push(`the value ${fmt(c.outside[0], 4)} is in none of the bins (${fmt(bins[0][0], 4)} to ${fmt(bins[bins.length - 1][1], 4)}): add a bin`); return null; }
    if (counts && counts.some((v, i) => v !== c.counts[i])) { const i = counts.findIndex((v, k) => v !== c.counts[k]); out.push(`bin ${i + 1} (${fmt(bins[i][0], 4)} to ${fmt(bins[i][1], 4)}) is given ${counts[i]} but the data has ${c.counts[i]} values in it: give the data or the counts, and they must agree`); return null; }
    counts = c.counts;
  }
  if (!counts) { out.push(`${kind} needs "counts" (one for each bin) or "data" (the values, sorted into the bins)`); return null; }
  if (!counts.some(c => c > 0)) { out.push('the bins are all empty'); return null; }
  return { bins, counts };
}
function histRead(d) {
  const out = [], odd = ddOdd(d, HIST_KEYS, 'histogram'); if (odd) return { problems: [odd] };
  ddTexts(d, out);
  const b = ddBinned(d, out, 'histogram'); if (!b) return { problems: out };
  const widths = b.bins.map(([lo, hi]) => ddClean(hi - lo)), equal = widths.every(x => Math.abs(x - widths[0]) < 1e-9);
  if (d.density !== undefined && typeof d.density !== 'boolean') out.push('"density" must be true or false');
  if (d.density === false && !equal) out.push('bins of different widths must be drawn as frequency density (each bar\'s area is its frequency): leave out "density: false"');
  const density = d.density === true || !equal;
  if (d.polygon !== undefined && typeof d.polygon !== 'boolean') out.push('"polygon" must be true or false');
  const heights = b.counts.map((c, i) => (density ? c / widths[i] : c));
  const x = ddRange({ step: d.step }, b.bins[0][0], b.bins[b.bins.length - 1][1], out, 'the x axis', { max: 60 });
  const y = ddRange({ step: d.ystep }, 0, Math.max(...heights), out, 'the y axis', { zero: true });
  if (out.length) return { problems: out };
  if (b.bins.some(([lo, hi]) => Math.abs((lo - x.from) / x.step - Math.round((lo - x.from) / x.step)) > 1e-6 && Math.abs((hi - x.from) / x.step - Math.round((hi - x.from) / x.step)) > 1e-6)) out.push('every bin must start or end on a tick of the x axis: choose its "step"');
  return { problems: out, ...b, widths, equal, density, heights, x, y };
}
export const histogram = {
  check(d) { return histRead(d).problems; },
  /** n, each bin's frequency, width and frequency density, the modal class, the class the median is in, and the mean
   *  estimated from the midpoints. */
  solve(d) {
    const r = histRead(d); if (r.problems.length) return null;
    const n = r.counts.reduce((t, c) => t + c, 0), top = Math.max(...r.heights);
    let acc = 0, medianClass = null; for (let i = 0; i < r.bins.length; i++) { acc += r.counts[i]; if (medianClass === null && acc >= n / 2) medianClass = r.bins[i]; }
    return { n, bins: r.bins, counts: r.counts, widths: r.widths, densities: r.counts.map((c, i) => ddClean(c / r.widths[i])), modalClass: r.bins[r.heights.indexOf(top)], medianClass,
      meanEstimate: ddClean(r.bins.reduce((t, [lo, hi], i) => t + ((lo + hi) / 2) * r.counts[i], 0) / n), density: r.density };
  },
  draw(d, o) {
    const r = histRead(d), P = palette(o), lang = o.lang, W = figWords(lang), paints = ddPaints(o, d, 'histogram');
    const C = ddCart(o, { x: r.x, y: r.y, w: 440, h: 260, xfmt: v => fmt(v, ddDp(r.x.step), lang), yfmt: v => fmt(v, ddDp(r.y.step), lang), heading: text(d.heading, 60), xtitle: text(d.xtitle, 60),
      ytitle: text(d.ytitle, 60) || W(r.density ? 'frequencyDensity' : 'frequency'), ynums: !hides(o, 'scale') });
    const kids = [...C.kids];
    if (o.hide !== true) {
      r.bins.forEach(([lo, hi], i) => {
        if (hides(o, `bin${i + 1}`)) return;
        kids.push(node('rect', { x: C.X(lo), y: C.Y(r.heights[i]), width: C.X(hi) - C.X(lo), height: C.Y(0) - C.Y(r.heights[i]), fill: paints.fill(0), stroke: P.ink, 'stroke-width': 1.4, class: 'of-bar', 'data-count': r.counts[i] }));
      });
      if (d.polygon && !hides(o, 'polygon')) {
        const pts = r.bins.map(([lo, hi], i) => [C.X((lo + hi) / 2), C.Y(r.heights[i])]);
        kids.push(poly(pts, { stroke: o.print ? P.ink : P.red, 'stroke-width': 2.5, class: 'of-polygon' }), ...pts.map(([x, y]) => node('circle', { cx: x, cy: y, r: 3.5, fill: o.print ? P.ink : P.red })));
      }
    }
    return ddFrame(C.W, C.H, kids, o, 'histogram', o.title || text(d.heading, 60) || W('histogram'), paints);
  },
};

// ---------------------------------------------------------------- box plot
const BOX_KEYS = ['data', 'summary', 'plots', 'outliers', 'values', 'from', 'to', 'step', 'xtitle'];
const BOX_PARTS = ['min', 'q1', 'median', 'q3', 'max'];
function boxRead(d) {
  const out = [], odd = ddOdd(d, BOX_KEYS, 'boxPlot'); if (odd) return { problems: [odd] };
  ddTexts(d, out, ['heading', 'xtitle']);
  const one = d.data !== undefined || d.summary !== undefined;
  if (one === (d.plots !== undefined)) return { problems: [...out, 'give one box plot ("data" and/or "summary") or several ("plots": [{ "name", "data" or "summary" }]), not both'] };
  const list = one ? [{ data: d.data, summary: d.summary }] : d.plots;
  if (!Array.isArray(list) || list.length < 1 || list.length > 4) return { problems: [...out, '"plots" must list 1 to 4 box plots'] };
  if (d.outliers !== undefined && typeof d.outliers !== 'boolean') out.push('"outliers" must be true or false');
  if (d.values !== undefined && typeof d.values !== 'boolean') out.push('"values" must be true or false');
  const plots = list.map((p, i) => {
    const at = one ? 'the box plot' : `box plot ${i + 1}`;
    if (!p || typeof p !== 'object') { out.push(`${at} must be { "name", "data" or "summary" }`); return null; }
    if (!one && Object.keys(p).some(k => !['name', 'data', 'summary'].includes(k))) { out.push(`${at} takes name, data, summary`); return null; }
    if (!one && p.name !== undefined && !text(p.name, 24)) out.push(`${at}: "name" must be short text`);
    let data = null, sum = null;
    if (p.data !== undefined) { data = ddNumList(p.data, `${at}: "data"`, out, { max: 200 }); if (!data) return null; sum = stSummary(data); }
    if (p.summary !== undefined) {
      const s = Array.isArray(p.summary) && p.summary.length === 5 ? p.summary.map(ddV) : null;
      if (!s || s.some(v => v === null) || s.some((v, k) => k && v < s[k - 1])) { out.push(`${at}: "summary" must be the five numbers [min, Q1, median, Q3, max], smallest first`); return null; }
      const given = Object.fromEntries(BOX_PARTS.map((k, j) => [k, s[j]]));
      if (sum) { const k = BOX_PARTS.find(q => Math.abs(sum[q] - given[q]) > 1e-9); if (k) { out.push(`${at}: the summary gives ${{ min: 'the minimum', q1: 'Q1', median: 'the median', q3: 'Q3', max: 'the maximum' }[k]} as ${fmt(given[k], 4)} but the data's is ${fmt(sum[k], 4)} (quartiles are the medians of the lower and upper halves): give the data or the summary, and they must agree`); return null; } }
      sum = given;
    }
    if (!sum) { out.push(`${at} needs "data" or "summary"`); return null; }
    let ends = { lo: sum.min, hi: sum.max, outliers: [] };
    if (d.outliers) { if (!data) { out.push(`${at}: outliers are worked out from the data, so it needs "data"`); return null; } ends = stOutliers(data, sum); }
    return { name: one ? '' : text(p.name, 24), data, sum, ends };
  });
  if (out.length || plots.some(p => !p)) return { problems: out };
  const lo = Math.min(...plots.map(p => p.sum.min)), hi = Math.max(...plots.map(p => p.sum.max));
  const r = ddRange(d, lo, hi, out, 'the number line');
  if (out.length) return { problems: out };
  return { problems: [], plots, r, one };
}
export const boxPlot = {
  check(d) { return boxRead(d).problems; },
  /** For each box plot: the five-number summary, range, IQR, outliers, and with data n and the mean. One box plot: that
   *  object; several: { plots: [...] }. */
  solve(d) {
    const r = boxRead(d); if (r.problems.length) return null;
    const each = p => ({ name: p.name || null, ...p.sum, range: ddClean(p.sum.max - p.sum.min), iqr: ddClean(p.sum.q3 - p.sum.q1), outliers: p.ends.outliers, whiskers: [p.ends.lo, p.ends.hi], ...(p.data ? { n: p.data.length, mean: ddStats(p.data).mean } : {}) });
    return r.one ? each(r.plots[0]) : { plots: r.plots.map(each) };
  },
  draw(d, o) {
    const r = boxRead(d), P = palette(o), lang = o.lang, W = figWords(lang), paints = ddPaints(o, d, 'boxPlot');
    const nameW = r.one ? 0 : Math.max(0, ...r.plots.map(p => ddTextW(p.name, 13))) + 12, L = 36 + nameW, w = 440, T = 18 + (d.heading ? 30 : 0), bh = 44, gap = d.values ? 40 : 22;
    const y = T + r.plots.length * (bh + gap) + 10, N = ddLine(o, r.r, y, L, w, v => fmt(v, ddDp(r.r.step), lang)), kids = [...N.kids], X = N.X;
    const showV = d.values && o.hide !== true;
    r.plots.forEach((p, i) => {
      const cy = T + (d.values ? 30 : 10) + i * (bh + gap) + bh / 2, s = p.sum, c = o.print ? P.ink : seriesColour(o, i);
      kids.push(node('g', { class: 'of-box', 'data-plot': i },
        line(X(p.ends.lo), cy, X(s.q1), cy, P.ink, 2), line(X(s.q3), cy, X(p.ends.hi), cy, P.ink, 2),
        line(X(p.ends.lo), cy - bh * 0.3, X(p.ends.lo), cy + bh * 0.3, P.ink, 2), line(X(p.ends.hi), cy - bh * 0.3, X(p.ends.hi), cy + bh * 0.3, P.ink, 2),
        node('rect', { x: X(s.q1), y: cy - bh / 2, width: Math.max(0, X(s.q3) - X(s.q1)), height: bh, fill: o.print ? paints.fill(i) : P.fill, stroke: c, 'stroke-width': 2.4 }),
        line(X(s.median), cy - bh / 2, X(s.median), cy + bh / 2, c, 3),
        p.ends.outliers.map(v => node('circle', { cx: X(v), cy, r: 4.5, fill: P.ink, class: 'of-outlier' }))));
      if (p.name) kids.push(label(L - 30, cy, p.name, { anchor: 'end', size: 13, colour: P.ink, cls: 'of-name' }));
      if (showV) {
        const at = [['min', p.ends.lo], ['q1', s.q1], ['median', s.median], ['q3', s.q3], ['max', p.ends.hi]].filter(([k]) => !hides(o, k));
        let last = -1e9;
        for (const [k, v] of at) { const t = fmt(v, 3, lang), x = Math.max(X(v), last + ddTextW(t, 12) / 2 + 4); kids.push(label(x, cy - bh / 2 - 10, t, { anchor: 'middle', size: 12, colour: P.ink, cls: `of-value of-${k}` })); last = x + ddTextW(t, 12) / 2; }
      }
    });
    const Wd = L + w + 40, Hd = y + 36 + (d.xtitle ? 26 : 0);
    if (d.heading) kids.push(label(Wd / 2, 24, text(d.heading, 60), { anchor: 'middle', size: 16, colour: P.ink, cls: 'of-heading' }));
    if (d.xtitle) kids.push(label(L + w / 2, Hd - 14, text(d.xtitle, 60), { anchor: 'middle', size: 13, colour: P.ink, cls: 'of-axis-title' }));
    return ddFrame(Wd, Hd, kids, o, 'boxPlot', o.title || text(d.heading, 60) || W('boxPlot'), paints);
  },
};

// ---------------------------------------------------------------- scatter plot
const SCAT_KEYS = ['points', 'x', 'y', 'xstep', 'ystep', 'fit', 'equation', 'r', 'dp', 'xtitle', 'ytitle'];
function scatRead(d) {
  const out = [], odd = ddOdd(d, SCAT_KEYS, 'scatterPlot'); if (odd) return { problems: [odd] };
  ddTexts(d, out);
  if (!Array.isArray(d.points) || d.points.length < 1 || d.points.length > 100 || d.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(v => isNum(v, -1e9, 1e9)))) return { problems: [...out, '"points" must list 1 to 100 points [x, y]'] };
  for (const k of ['fit', 'equation', 'r']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
  if (d.dp !== undefined && !(Number.isInteger(d.dp) && d.dp >= 0 && d.dp <= 4)) out.push('"dp" (decimal places of the equation and r) must be 0 to 4');
  const pts = d.points, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const rng = (v, s, lo, hi, what) => (v !== undefined && !(Array.isArray(v) && v.length === 2) ? (out.push(`"${what}" must be [from, to]`), null) : ddRange({ from: v && v[0], to: v && v[1], step: s }, lo, hi, out, `the ${what} axis`));
  const x = rng(d.x, d.xstep, Math.min(...xs), Math.max(...xs), 'x'), y = rng(d.y, d.ystep, Math.min(...ys), Math.max(...ys), 'y');
  const fit = stFit(pts), r = stCorrelation(pts);
  if ((d.fit || d.equation) && !fit) out.push('a line of best fit needs at least 2 points with different x values');
  if (d.r && r === null) out.push('r needs both x and y to vary');
  if (d.equation && !d.fit) out.push('"equation" writes the line of best fit\'s equation: it needs "fit": true');
  if (out.length) return { problems: out };
  return { problems: [], pts, x, y, fit, r };
}
export const scatterPlot = {
  check(d) { return scatRead(d).problems; },
  /** n, the means of x and y, the least-squares line { slope, intercept } and Pearson's r (as a calculator works them). */
  solve(d) { const r = scatRead(d); if (r.problems.length) return null; const n = r.pts.length; return { n, meanX: ddClean(r.pts.reduce((t, p) => t + p[0], 0) / n), meanY: ddClean(r.pts.reduce((t, p) => t + p[1], 0) / n), fit: r.fit, r: r.r }; },
  draw(d, o) {
    const r = scatRead(d), P = palette(o), lang = o.lang, W = figWords(lang), dp = d.dp === undefined ? 2 : d.dp;
    const C = ddCart(o, { x: r.x, y: r.y, w: 420, h: 300, gridX: true, xfmt: v => fmt(v, ddDp(r.x.step), lang), yfmt: v => fmt(v, ddDp(r.y.step), lang), heading: text(d.heading, 60), xtitle: text(d.xtitle, 60), ytitle: text(d.ytitle, 60) });
    const kids = [...C.kids];
    if (o.hide !== true) {
      if (d.fit && !hides(o, 'fit')) {
        // the line across the plot, clipped to it
        const f = x => r.fit.slope * x + r.fit.intercept, a = r.x.from, b = r.x.to, seg = [];
        for (let k = 0; k <= 200; k++) { const x = a + ((b - a) * k) / 200, y = f(x); if (y >= r.y.from - 1e-9 && y <= r.y.to + 1e-9) seg.push([C.X(x), C.Y(y)]); }
        if (seg.length > 1) kids.push(line(seg[0][0], seg[0][1], seg[seg.length - 1][0], seg[seg.length - 1][1], o.print ? P.ink : P.red, 2.6, { class: 'of-fit', ...(o.print ? { 'stroke-dasharray': '8 5' } : {}) }));
      }
      if (!hides(o, 'points')) for (const [x, y] of r.pts) kids.push(node('circle', { cx: C.X(x), cy: C.Y(y), r: 4.5, fill: o.print ? P.ink : P.blue, class: 'of-point' }));
      const lines = [];
      if (d.equation && !hides(o, 'equation')) { const m = r.fit.slope, c = r.fit.intercept; lines.push(['y', ' = ', fmt(m, dp, lang), 'x', Math.abs(c) < 0.5 * 10 ** -dp ? '' : c < 0 ? ` − ${fmt(-c, dp, lang)}` : ` + ${fmt(c, dp, lang)}`]); }
      if (d.r && !hides(o, 'r')) lines.push(['r', ' = ', fmt(r.r, dp, lang).replace('-', '−')]);
      lines.forEach((l, i) => { const bx = mathBox(l.filter(Boolean), 15, { lang }); kids.push(node('rect', { x: C.L + 8, y: C.T + 6 + i * 24, width: bx.w + 12, height: 22, rx: 4, fill: P.paper, 'fill-opacity': 0.9 }), mathNode(bx, C.L + 14, C.T + 22 + i * 24, { color: P.ink, cls: i === 0 && d.equation ? 'of-equation' : 'of-r' })); });
    }
    return ddFrame(C.W, C.H, kids, o, 'scatterPlot', o.title || text(d.heading, 60) || W('scatterPlot'));
  },
};

// ---------------------------------------------------------------- stem-and-leaf
const SL_KEYS = ['data', 'data2', 'names', 'leaf', 'split', 'key', 'unit'];
function slRead(d) {
  const out = [], odd = ddOdd(d, SL_KEYS, 'stemAndLeaf'); if (odd) return { problems: [odd] };
  ddTexts(d, out, ['heading']);
  const u = d.leaf === undefined ? 1 : d.leaf;
  if (![0.01, 0.1, 1, 10, 100].includes(u)) return { problems: [...out, '"leaf" (what one leaf counts) must be 0.01, 0.1, 1, 10 or 100: with 1, 25 is stem 2, leaf 5'] };
  for (const k of ['split', 'key']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
  if (d.unit !== undefined && !text(d.unit, 12)) out.push('"unit" must be short text, like "cm"');
  const sets = [d.data, d.data2].filter(v => v !== undefined).map((v, i) => ddNumList(v, `"${i ? 'data2' : 'data'}"`, out, { max: 80, pos: true }));
  if (!sets.length) out.push('"data" must list the values');
  if (out.length || sets.some(s => !s)) return { problems: out };
  if (d.names !== undefined && (!Array.isArray(d.names) || d.names.length !== sets.length || d.names.some(n => !text(n, 20)))) out.push(`"names" must list ${sets.length} short names (one for each data set)`);
  const parts = sets.map(s => s.map(v => {
    const k = Math.round(v / u);
    if (Math.abs(v / u - k) > 1e-6) { out.push(`the value ${fmt(v, 4)} is not a whole number of leaves (each leaf counts ${fmt(u, 2)}): round it, or change "leaf"`); return null; }
    return { v, stem: Math.floor(k / 10), leaf: k % 10 };
  }));
  if (out.length) return { problems: out };
  const all = parts.flat(), lo = Math.min(...all.map(p => p.stem)), hi = Math.max(...all.map(p => p.stem));
  if (hi - lo > 15) return { problems: ['the data spans more than 16 stems: use a bigger "leaf"'] };
  const rows = [];
  for (let s = lo; s <= hi; s++) for (const half of d.split ? [0, 1] : [null]) {
    const inRow = p => p.stem === s && (half === null || (half === 0 ? p.leaf < 5 : p.leaf >= 5));
    rows.push({ stem: s, half, leaves: parts.map(ps => ps.filter(inRow).map(p => p.leaf).sort((a, b) => a - b)) });
  }
  if (rows.some(r => r.leaves.some(l => l.length > 24))) return { problems: ['at most 24 leaves on one stem: use "split": true or a bigger "leaf"'] };
  return { problems: [], u, sets, parts, rows, two: sets.length === 2, names: d.names || null };
}
/** A stem's or leaf's value written out: stem 2 with leaf 5 at leaf 1 -> 25; at leaf 0.1 -> 2.5. */
const slValue = (stem, leaf, u) => ddClean((stem * 10 + leaf) * u);
export const stemAndLeaf = {
  check(d) { return slRead(d).problems; },
  /** For each data set: n, mean, median, mode, range, quartiles and IQR, min and max; and the stems with their leaves. */
  solve(d) {
    const r = slRead(d); if (r.problems.length) return null;
    const each = s => ddStats(s);
    return { ...each(r.sets[0]), ...(r.two ? { second: each(r.sets[1]) } : {}), stems: r.rows.map(x => ({ stem: x.stem, leaves: x.leaves })) };
  },
  draw(d, o) {
    const r = slRead(d), P = palette(o), lang = o.lang, W = figWords(lang), FS = 18, rowH = 28, cw = 15;
    const leafCol = i => Math.max(4, ...r.rows.map(x => x.leaves[i].length)) * cw + 16, stemW = Math.max(ddTextW(W('stem'), 14) + 20, ...r.rows.map(x => ddTextW(String(Math.abs(x.stem)), FS) + 24));
    const T = 18 + (d.heading ? 30 : 0) + 30, L = 24, lw = r.two ? leafCol(1) : 0, rw = leafCol(0);
    const xStem = L + lw, xRight = xStem + stemW, kids = [], blank = o.hide === true || hides(o, 'leaves');
    // the headings: Leaf | Stem | Leaf (back to back) or Stem | Leaf, and the names over the leaves
    const head = (x, t, anchor) => kids.push(label(x, T - 14, t, { anchor, size: 14, colour: P.ink, cls: 'of-head' }));
    head(xStem + stemW / 2, W('stem'), 'middle'); head(xRight + 10, r.names ? r.names[0] : W('leaf'), 'start'); if (r.two) head(xStem - 10, r.names ? r.names[1] : W('leaf'), 'end');
    r.rows.forEach((row, k) => {
      const y = T + 6 + k * rowH + rowH / 2;
      kids.push(node('text', { x: xStem + stemW / 2, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': FS, 'font-weight': 700, fill: P.ink, class: 'of-stem', 'font-family': 'ui-monospace, Menlo, Consolas, monospace' }, String(row.stem)));
      if (blank) return;
      const right = row.leaves[0];
      right.forEach((l, j) => kids.push(label(xRight + 12 + j * cw, y, String(l), { size: FS, weight: 500, colour: P.blue, cls: 'of-leaf' })));
      if (r.two) row.leaves[1].forEach((l, j) => kids.push(label(xStem - 12 - j * cw, y, String(l), { anchor: 'end', size: FS, weight: 500, colour: o.print ? P.ink : P.red, cls: 'of-leaf' })));
    });
    const bottom = T + 6 + r.rows.length * rowH;
    kids.push(line(xStem + stemW - 2, T, xStem + stemW - 2, bottom, P.ink, 2), line(L, T, xRight + rw, T, P.ink, 1.5));
    if (r.two) kids.push(line(xStem + 2, T, xStem + 2, bottom, P.ink, 2));
    let Hd = bottom + 16;
    if (d.key !== false && !hides(o, 'key')) {
      // the key, from a value in the data: "2 | 5 means 25" (both sides when back to back)
      const unit = d.unit ? ` ${text(d.unit, 12)}` : '';
      const keyOf = (i, left) => { const p = r.parts[i][0]; return left ? `${p.leaf} | ${p.stem} ${W('means')} ${fmt(slValue(p.stem, p.leaf, r.u), 2, lang)}${unit}` : `${p.stem} | ${p.leaf} ${W('means')} ${fmt(slValue(p.stem, p.leaf, r.u), 2, lang)}${unit}`; };
      const keys = r.two ? [keyOf(1, true), keyOf(0, false)] : [keyOf(0, false)];
      keys.forEach((t, i) => kids.push(label(L, Hd + 10 + i * 22, `${W('key')}: ${t}`, { size: 14, weight: 600, colour: P.ink, cls: 'of-key' })));
      Hd += 12 + keys.length * 22;
    }
    const Wd = Math.max(xRight + rw + 24, 300);
    if (d.heading) kids.push(label(Wd / 2, 24, text(d.heading, 60), { anchor: 'middle', size: 16, colour: P.ink, cls: 'of-heading' }));
    return ddFrame(Wd, Hd + 6, kids, o, 'stemAndLeaf', o.title || text(d.heading, 60) || W('stemAndLeaf'));
  },
};

// ---------------------------------------------------------------- pie chart
const PIE_KEYS = ['slices', 'show', 'key', 'dp', 'labels'];
const PIE_SHOW = ['name', 'value', 'percent', 'angle', 'fraction'];
const ddGcd = (a, b) => (b ? ddGcd(b, a % b) : Math.abs(a));
function pieRead(d) {
  const out = [], odd = ddOdd(d, PIE_KEYS, 'pieChart'); if (odd) return { problems: [odd] };
  ddTexts(d, out, ['heading']);
  if (!Array.isArray(d.slices) || d.slices.length < 1 || d.slices.length > 10) return { problems: [...out, '"slices" must list 1 to 10 slices, like [{ "name": "Walk", "value": 12 }]'] };
  const slices = d.slices.map((s, i) => {
    if (!s || !text(s.name, 24) || !isNum(s.value, 0, 1e9) || s.value === 0) { out.push(`slice ${i + 1} must be { "name", "value" } with a value above 0`); return null; }
    return { name: text(s.name, 24), value: s.value };
  });
  if (out.length) return { problems: out };
  if (new Set(slices.map(s => s.name)).size !== slices.length) out.push('the slices must have different names');
  const show = d.show === undefined ? ['name'] : Array.isArray(d.show) ? d.show : [d.show];
  if (!show.length || show.some(s => !PIE_SHOW.includes(s))) out.push(`"show" must be one or more of ${PIE_SHOW.join(', ')}`);
  if (d.key !== undefined && typeof d.key !== 'boolean') out.push('"key" must be true or false');
  if (d.dp !== undefined && !(Number.isInteger(d.dp) && d.dp >= 0 && d.dp <= 3)) out.push('"dp" must be 0 to 3');
  const total = slices.reduce((t, s) => t + s.value, 0), dp = d.dp === undefined ? 1 : d.dp;
  for (const s of slices) { s.angle = (s.value / total) * 360; s.percent = (s.value / total) * 100; }
  if (d.labels !== undefined) {
    if (!d.labels || typeof d.labels !== 'object' || Array.isArray(d.labels)) out.push('"labels" must be { "slice name": a label }, like { "Walk": "x" }');
    else for (const [k, l] of Object.entries(d.labels)) {
      const s = slices.find(x => x.name === k);
      if (!s) { out.push(`labels: "${k}" is not one of the slices`); continue; }
      if (l === false) continue;
      const v = mathValue(typeof l === 'string' ? l.trim().replace(/\s*[%°]$/, '') : l), measures = show.filter(m => ['value', 'percent', 'angle'].includes(m));
      const why = mathProblem(l, `the label of ${k}`); if (why) { out.push(why); continue; }
      if (v !== null && !(measures.length ? measures : ['angle']).some(m => !ddClaim(l, s[m], k))) out.push(`${k} is labeled ${mathText(l)}, but its ${(measures.length ? measures : ['angle']).join(' or ')} is ${(measures.length ? measures : ['angle']).map(m => fmt(s[m], 2)).join(' or ')}: a label that states a number must state the true one`);
    }
  }
  if (out.length) return { problems: out };
  return { problems: [], slices, show, total, dp };
}
export const pieChart = {
  check(d) { return pieRead(d).problems; },
  /** The total, and each slice's value, angle (degrees), percent and fraction of the whole [n, d] (in lowest terms when
   *  the values are whole numbers). */
  solve(d) {
    const r = pieRead(d); if (r.problems.length) return null;
    return { total: ddClean(r.total), slices: r.slices.map(s => ({ name: s.name, value: s.value, angle: ddClean(s.angle), percent: ddClean(s.percent), fraction: Number.isInteger(s.value) && Number.isInteger(r.total) ? [s.value / ddGcd(s.value, r.total), r.total / ddGcd(s.value, r.total)] : null })) };
  },
  draw(d, o) {
    const r = pieRead(d), P = palette(o), lang = o.lang, W = figWords(lang), paints = ddPaints(o, d, 'pieChart');
    const R = 130, keyW = d.key ? 40 + Math.max(...r.slices.map(s => ddTextW(s.name, 13))) : 0, T = 18 + (d.heading ? 30 : 0);
    const cx = 60 + R + 70, cy = T + R + 40, kids = [], Wd = cx + R + 90 + keyW, Hd = cy + R + 50;
    const at = (deg, rad) => [cx + rad * Math.sin((deg * Math.PI) / 180), cy - rad * Math.cos((deg * Math.PI) / 180)];   // clockwise from the top
    let a0 = 0;
    const labels = [];
    r.slices.forEach((s, i) => {
      const a1 = a0 + s.angle, [x0, y0] = at(a0, R), [x1, y1] = at(a1, R), big = s.angle > 180 ? 1 : 0;
      const dPath = r.slices.length === 1 ? `M${r2(cx)},${r2(cy - R)} A${R},${R} 0 1 1 ${r2(cx - 0.01)},${r2(cy - R)} Z` : `M${r2(cx)},${r2(cy)} L${r2(x0)},${r2(y0)} A${R},${R} 0 ${big} 1 ${r2(x1)},${r2(y1)} Z`;
      kids.push(node('path', { d: dPath, fill: o.hide === true ? P.paper : paints.fill(i), stroke: P.ink, 'stroke-width': 1.8, 'stroke-linejoin': 'round', class: 'of-slice', 'data-name': s.name, 'data-angle': r2(s.angle) }));
      if (o.hide !== true && !hides(o, 'labels') && !hides(o, s.name)) {
        const given = d.labels && d.labels[s.name] !== undefined ? d.labels[s.name] : undefined;
        const shown = r.show.filter(m => !(m === 'name' && d.key)), named = shown.includes('name') ? [{ text: s.name }] : [];
        const bits = given !== undefined ? (given === false ? [] : [...named, given]) : shown.map(m => (m === 'name' ? { text: s.name } : m === 'value' ? s.value : m === 'percent' ? `${fmt(s.percent, r.dp, lang)}%` : m === 'angle' ? `${fmt(s.angle, r.dp, lang)}°`
          : (() => { const g = ddGcd(Math.round(s.value), Math.round(r.total)); return Number.isInteger(s.value) && Number.isInteger(r.total) ? { frac: [s.value / g, r.total / g] } : fmt(s.value / r.total, 3, lang); })()));
        if (bits.length) labels.push({ mid: (a0 + a1) / 2, ang: s.angle, bits });
      }
      a0 = a1;
    });
    for (const l of labels) {
      const boxes = l.bits.map(b => mathBox(b, 14, { lang })).filter(Boolean), bw = Math.max(...boxes.map(b => b.w)), bh = boxes.reduce((t, b) => t + b.asc + b.desc + 2, 0);
      const inside = l.ang >= 40 && bw < R * 0.7;
      let [x, y] = at(l.mid, inside ? R * 0.6 : R + 16 + bw / 2);
      if (!inside) { const [ax, ay] = at(l.mid, R), [bx2, by2] = at(l.mid, R + 12); kids.push(line(ax, ay, bx2, by2, P.ink, 1.2)); }
      let yy = y - bh / 2;
      if (inside && !o.print) kids.push(node('rect', { x: x - bw / 2 - 4, y: yy - 2, width: bw + 8, height: bh + 4, rx: 4, fill: P.paper, 'fill-opacity': 0.88 }));
      for (const b of boxes) { yy += b.asc; kids.push(mathNode(b, x - b.w / 2, yy, { color: P.ink, cls: 'of-slice-label', halo: o.print && inside ? '#FFFFFF' : null })); yy += b.desc + 2; }
    }
    if (d.key) kids.push(ddKey(o, r.slices.map((s, i) => ({ name: s.name, fill: o.hide === true ? P.paper : paints.fill(i) })), cx + R + 60, cy - R + 10));
    if (d.heading) kids.push(label(Wd / 2, 24, text(d.heading, 60), { anchor: 'middle', size: 16, colour: P.ink, cls: 'of-heading' }));
    return ddFrame(Wd, Hd, kids, o, 'pieChart', o.title || text(d.heading, 60) || W('pieChart'), paints);
  },
};

// ---------------------------------------------------------------- cumulative frequency
const CF_KEYS = ['bins', 'counts', 'data', 'cumulative', 'holds', 'join', 'readings', 'at', 'percent', 'step', 'ystep', 'xtitle', 'ytitle'];
const CF_READ = { median: 0.5, q1: 0.25, q3: 0.75 };
function cfRead(d) {
  const out = [], odd = ddOdd(d, CF_KEYS, 'cumulativeFrequency'); if (odd) return { problems: [odd] };
  ddTexts(d, out);
  let b;
  if (d.cumulative !== undefined) {
    const bins = ddBins(d.bins, out); if (!bins) return { problems: out };
    if (d.counts !== undefined || d.data !== undefined) return { problems: ['give "cumulative" (a cumulative frequency table) or "counts" / "data", not both'] };
    if (!Array.isArray(d.cumulative) || d.cumulative.length !== bins.length || !d.cumulative.every(ddCount) || d.cumulative.some((c, i) => i && c < d.cumulative[i - 1])) return { problems: [`"cumulative" must list ${bins.length} running totals that never go down`] };
    b = { bins, counts: d.cumulative.map((c, i) => c - (i ? d.cumulative[i - 1] : 0)) };
  } else b = ddBinned(d, out, 'cumulativeFrequency');
  if (!b) return { problems: out };
  if (d.join !== undefined && !['curve', 'lines'].includes(d.join)) out.push('"join" must be "curve" (a smooth curve) or "lines" (straight lines, a cumulative frequency polygon)');
  if (d.percent !== undefined && typeof d.percent !== 'boolean') out.push('"percent" must be true or false');
  const readings = d.readings === undefined ? [] : Array.isArray(d.readings) ? d.readings : [d.readings];
  if (readings.some(k => !CF_READ[k])) out.push('"readings" must be any of "median", "q1", "q3" (read off the graph with dashed lines)');
  const n = b.counts.reduce((t, c) => t + c, 0), cum = []; b.counts.reduce((t, c, i) => (cum[i] = t + c), 0);
  const pts = [[b.bins[0][0], 0], ...b.bins.map(([, hi], i) => [hi, cum[i]])];
  const curve = d.join === 'lines' ? pts : stSmooth(pts, 32);
  const lo = b.bins[0][0], hi = b.bins[b.bins.length - 1][1];
  const at = d.at === undefined ? [] : Array.isArray(d.at) ? d.at : [d.at];
  if (at.length > 3 || at.some(v => !isNum(v, lo, hi))) out.push(`"at" must list up to 3 values from ${fmt(lo, 4)} to ${fmt(hi, 4)} (how many are up to there is read off the graph)`);
  const x = ddRange({ step: d.step }, lo, hi, out, 'the x axis', { max: 60 }), y = ddRange({ step: d.ystep }, 0, d.percent ? 100 : n, out, 'the y axis', { zero: true });
  if (out.length) return { problems: out };
  // reading the drawn curve: the x where it reaches a height, and its height at an x
  const xAt = target => { for (let i = 1; i < curve.length; i++) { const [x0, y0] = curve[i - 1], [x1, y1] = curve[i]; if (y1 >= target - 1e-9 && y1 > y0) return ddClean(y0 >= target ? x0 : x0 + ((target - y0) / (y1 - y0)) * (x1 - x0)); } return hi; };
  const yAt = xv => { for (let i = 1; i < curve.length; i++) { const [x0, y0] = curve[i - 1], [x1, y1] = curve[i]; if (xv <= x1 + 1e-9) return ddClean(x1 === x0 ? y1 : y0 + ((xv - x0) / (x1 - x0)) * (y1 - y0)); } return n; };
  return { problems: [], ...b, n, cum, pts, curve, x, y, readings, at, xAt, yAt, percent: !!d.percent };
}
export const cumulativeFrequency = {
  check(d) { return cfRead(d).problems; },
  /** n, the running totals, the points plotted (each bin's end, from 0 at the first bin's start), the median, quartiles
   *  and IQR read off the graph as drawn (at n/2, n/4 and 3n/4), and how many are up to each "at" value. */
  solve(d) {
    const r = cfRead(d); if (r.problems.length) return null;
    const med = r.xAt(r.n / 2), q1 = r.xAt(r.n / 4), q3 = r.xAt((3 * r.n) / 4);
    return { n: r.n, cumulative: r.cum, points: r.pts, median: med, q1, q3, iqr: ddClean(q3 - q1), at: r.at.map(v => ({ x: v, count: r.yAt(v) })) };
  },
  draw(d, o) {
    const r = cfRead(d), P = palette(o), lang = o.lang, W = figWords(lang), k = r.percent ? 100 / r.n : 1;
    const C = ddCart(o, { x: r.x, y: r.y, w: 440, h: 280, gridX: true, xfmt: v => fmt(v, ddDp(r.x.step), lang), yfmt: v => fmt(v, ddDp(r.y.step), lang), heading: text(d.heading, 60), xtitle: text(d.xtitle, 60), ytitle: text(d.ytitle, 60) || `${W('cumulativeFrequency')}${r.percent ? ' (%)' : ''}`, extraB: r.readings.length ? 20 : 0 });
    const kids = [...C.kids], ink = o.print ? P.ink : P.blue;
    if (o.hide !== true) {
      if (!hides(o, 'curve')) kids.push(poly(r.curve.map(([x, y]) => [C.X(x), C.Y(y * k)]), { stroke: ink, 'stroke-width': 2.8, class: 'of-curve' }));
      for (const [x, y] of r.pts) kids.push(node('path', { d: `M${r2(C.X(x) - 4)},${r2(C.Y(y * k) - 4)} L${r2(C.X(x) + 4)},${r2(C.Y(y * k) + 4)} M${r2(C.X(x) - 4)},${r2(C.Y(y * k) + 4)} L${r2(C.X(x) + 4)},${r2(C.Y(y * k) - 4)}`, stroke: P.ink, 'stroke-width': 2, class: 'of-point' }));
      const dash = (x, y, t) => {
        kids.push(poly([[C.L, C.Y(y * k)], [C.X(x), C.Y(y * k)], [C.X(x), C.Y(0)]], { stroke: o.print ? P.ink : P.red, 'stroke-width': 1.8, 'stroke-dasharray': '6 5', class: 'of-reading' }));
        if (t) kids.push(label(C.X(x), C.Y(0) + 36, t, { anchor: 'middle', size: 12, colour: o.print ? P.ink : P.red, cls: 'of-reading-value' }));
      };
      for (const q of r.readings) { const xv = r.xAt(r.n * CF_READ[q]); dash(xv, r.n * CF_READ[q], hides(o, 'readings') || hides(o, q) ? '' : fmt(xv, 1, lang)); }
      for (const xv of r.at) { const yv = r.yAt(xv); dash(xv, yv, ''); if (!hides(o, 'readings')) kids.push(label(C.L + 6, C.Y(yv * k) - 9, fmt(yv * k, 1, lang), { size: 12, colour: o.print ? P.ink : P.red, halo: P.paper, cls: 'of-reading-value' })); }
    }
    return ddFrame(C.W, C.H, kids, o, 'cumulativeFrequency', o.title || text(d.heading, 60) || W('cumulativeFrequency'));
  },
};

// ---------------------------------------------------------------- normal curve
const NC_KEYS = ['mean', 'sd', 'regions', 'areas', 'form', 'dp', 'z', 'reach', 'values', 'xtitle', 'marks'];
function ncRead(d) {
  const out = [], odd = ddOdd(d, NC_KEYS, 'normalCurve'); if (odd) return { problems: [odd] };
  ddTexts(d, out, ['heading', 'xtitle']);
  const mean = d.mean === undefined ? 0 : d.mean, sd = d.sd === undefined ? 1 : d.sd;
  if (!isNum(mean, -1e6, 1e6) || !isNum(sd, 1e-6, 1e6)) return { problems: [...out, '"mean" must be a number and "sd" (the standard deviation) a number above 0'] };
  const reach = d.reach === undefined ? 3 : d.reach;
  if (!Number.isInteger(reach) || reach < 2 || reach > 4) out.push('"reach" (how many standard deviations each side) must be 2, 3 or 4');
  for (const k of ['areas', 'z', 'values']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
  if (d.form !== undefined && !['percent', 'decimal'].includes(d.form)) out.push('"form" must be "percent" or "decimal"');
  if (d.dp !== undefined && !(Number.isInteger(d.dp) && d.dp >= 0 && d.dp <= 4)) out.push('"dp" must be 0 to 4');
  if (d.marks !== undefined && (!Array.isArray(d.marks) || d.marks.length > 4 || d.marks.some(v => !isNum(v, mean - reach * sd - 1e-9, mean + reach * sd + 1e-9)))) out.push('"marks" must list up to 4 values on the axis to write (beside the mean and the standard deviations)');
  const form = d.form || 'percent', dp = d.dp === undefined ? (form === 'percent' ? 2 : 4) : d.dp, lo = mean - reach * sd, hi = mean + reach * sd;
  const regions = (d.regions === undefined ? [] : Array.isArray(d.regions) ? d.regions : null);
  if (!regions || regions.length > 3) return { problems: [...out, '"regions" must list up to 3 regions, like [{ "from": 85, "to": 115 }] (leave out "from" or "to" for a tail)'] };
  const rs = regions.map((q, i) => {
    const at = `region ${i + 1}`;
    if (!q || typeof q !== 'object' || Object.keys(q).some(k => !['from', 'to', 'label'].includes(k))) { out.push(`${at} must be { "from", "to", "label" }`); return null; }
    if ((q.from !== undefined && !isNum(q.from)) || (q.to !== undefined && !isNum(q.to)) || (q.from === undefined && q.to === undefined)) { out.push(`${at}: "from" and "to" must be numbers (leave one out for a tail)`); return null; }
    if (q.from !== undefined && q.to !== undefined && !(q.to > q.from)) { out.push(`${at}: "to" must be past "from"`); return null; }
    for (const k of ['from', 'to']) if (q[k] !== undefined && (q[k] < lo - 1e-9 || q[k] > hi + 1e-9)) { out.push(`${at}: ${k} ${fmt(q[k], 4)} is off the curve as drawn (${fmt(lo, 4)} to ${fmt(hi, 4)}): use a bigger "reach"`); return null; }
    const area = stCdf(q.to === undefined ? Infinity : (q.to - mean) / sd) - stCdf(q.from === undefined ? -Infinity : (q.from - mean) / sd);
    const shown = form === 'percent' ? area * 100 : area;
    if (q.label !== undefined && q.label !== false) { const why = ddClaim(q.label, shown, at); if (why) { out.push(`${why} (its area${form === 'percent' ? ' as a percent' : ''})`); return null; } }
    return { from: q.from, to: q.to, area, label: q.label };
  });
  if (out.length) return { problems: out };
  return { problems: [], mean, sd, reach, lo, hi, regions: rs, form, dp };
}
export const normalCurve = {
  check(d) { return ncRead(d).problems; },
  /** Each region's area (as a decimal, and the z-scores of its ends), the z-score of every value on the axis. */
  solve(d) {
    const r = ncRead(d); if (r.problems.length) return null;
    const z = v => (v === undefined ? null : ddClean((v - r.mean) / r.sd));
    return { mean: r.mean, sd: r.sd, regions: r.regions.map(q => ({ from: q.from ?? null, to: q.to ?? null, zFrom: z(q.from), zTo: z(q.to), area: q.area, percent: q.area * 100 })) };
  },
  draw(d, o) {
    const r = ncRead(d), P = palette(o), lang = o.lang, W = figWords(lang), paints = ddPaints(o, d, 'normalCurve');
    const L = 40, w = 460, T = 26 + (d.heading ? 30 : 0), h = 210, base = T + h, X = v => L + ((v - r.lo) / (r.hi - r.lo)) * w, Y = v => base - (v / stPhi(0)) * h * 0.92;
    const f = v => stPhi((v - r.mean) / r.sd), kids = [];
    const path = (a, b) => { const pts = []; for (let k = 0; k <= 120; k++) { const v = a + ((b - a) * k) / 120; pts.push([X(v), Y(f(v))]); } return pts; };
    if (o.hide !== true) r.regions.forEach((q, i) => {
      const a = q.from === undefined ? r.lo : q.from, b = q.to === undefined ? r.hi : q.to, pts = path(a, b);
      kids.push(node('polygon', { points: [[X(a), base], ...pts, [X(b), base]].map(([x, y]) => `${r2(x)},${r2(y)}`).join(' '), fill: o.print ? paints.fill(i ? i + 1 : 0) : seriesColour(o, i), 'fill-opacity': o.print ? 1 : 0.35, stroke: 'none', class: 'of-region' }));
    });
    kids.push(poly(path(r.lo, r.hi), { stroke: P.ink, 'stroke-width': 2.6, class: 'of-curve' }), line(L - 10, base, L + w + 10, base, P.ink, 2));
    // the axis: the mean and each standard deviation, the regions' ends, and any marks
    const sds = Array.from({ length: 2 * r.reach + 1 }, (_, k) => k - r.reach), at = new Map();
    for (const k of sds) at.set(ddClean(r.mean + k * r.sd), k);
    for (const q of r.regions) for (const v of [q.from, q.to]) if (v !== undefined && !at.has(ddClean(v))) at.set(ddClean(v), null);
    for (const v of d.marks || []) if (!at.has(ddClean(v))) at.set(ddClean(v), null);
    const showV = d.values !== false && !hides(o, 'values');
    // a value that is not a standard deviation from the mean gets a row of its own when it would crowd one that is
    const crowded = [...at.entries()].some(([v, k]) => k === null && sds.some(j => Math.abs(X(v) - X(r.mean + j * r.sd)) < 34));
    const extraRow = crowded ? (d.z ? 40 : 20) : 0;
    for (const [v, k] of [...at.entries()].sort((a, b) => a[0] - b[0])) {
      kids.push(line(X(v), base - 5, X(v), base + 5, P.ink, 1.6));
      if (k !== null) kids.push(line(X(v), base, X(v), Y(f(v)), P.gridStrong, 1, { 'stroke-dasharray': '3 4' }));
      if (showV) kids.push(label(X(v), base + (k === null ? 18 + extraRow : 18), fmt(v, 3, lang).replace('-', '−'), { anchor: 'middle', size: 12, weight: 600, colour: k === null ? (o.print ? P.ink : P.red) : P.ink2, cls: 'of-num' }));
      if (d.z && k !== null) kids.push(label(X(v), base + 38, k === 0 ? '0' : `${k < 0 ? '−' : ''}${Math.abs(k)}`, { anchor: 'middle', size: 12, weight: 600, colour: P.ink2, cls: 'of-z' }));
    }
    if (d.z) kids.push(label(L - 16, base + 38, 'z', { anchor: 'end', size: 13, italic: true, colour: P.ink }));
    if (d.areas !== false && o.hide !== true && !hides(o, 'areas')) r.regions.forEach((q, i) => {
      if (hides(o, `region${i + 1}`) || q.label === false) return;
      const a = q.from === undefined ? r.lo : q.from, b = q.to === undefined ? r.hi : q.to, mid = (a + b) / 2;
      const t = q.label !== undefined ? q.label : r.form === 'percent' ? `${fmt(q.area * 100, r.dp, lang)}%` : fmt(q.area, r.dp, lang), bx = mathBox(t, 14, { lang });
      const wide = X(b) - X(a) > bx.w + 10 && f(mid) / stPhi(0) > 0.3;
      const x = wide ? X(mid) : X(mid), y = wide ? base - (base - Y(f(mid))) * 0.4 : Y(f(mid)) - 18 - i * 18;
      kids.push(node('rect', { x: x - bx.w / 2 - 4, y: y - bx.asc - 2, width: bx.w + 8, height: bx.asc + bx.desc + 4, rx: 4, fill: P.paper, 'fill-opacity': 0.9 }), mathNode(bx, x - bx.w / 2, y, { color: P.ink, cls: 'of-area' }));
    });
    const Wd = L + w + 40, Hd = base + (d.z ? 52 : 32) + extraRow + (d.xtitle ? 26 : 0);
    if (d.heading) kids.push(label(Wd / 2, 24, text(d.heading, 60), { anchor: 'middle', size: 16, colour: P.ink, cls: 'of-heading' }));
    if (d.xtitle) kids.push(label(L + w / 2, Hd - 14, text(d.xtitle, 60), { anchor: 'middle', size: 13, colour: P.ink, cls: 'of-axis-title' }));
    return ddFrame(Wd, Hd, kids, o, 'normalCurve', o.title || text(d.heading, 60) || W('normalCurve'), paints);
  },
};

export const DATA_KINDS = { barGraph, dotPlot, histogram, boxPlot, scatterPlot, stemAndLeaf, pieChart, cumulativeFrequency, normalCurve };
