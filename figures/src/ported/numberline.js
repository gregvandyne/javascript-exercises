// Oomba Figures: the number line. A line from "from" to "to" with a tick every "step", numbered every "every" ticks
// (counting from 0 when 0 is on the line), in decimals, fractions, multiples of π or degrees. On it: sets of numbers
// (intervals with open or closed ends, or running off an end with their own arrow, as inequalities are graphed), points
// (dots or crosses, with a letter and, if asked, their value) and the terms of a sequence. Every mark sits at its value:
// the line is always 600 units long and a value v is drawn at from + (v - from) / (to - from) of it.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: the layout (tick numbering, label rows above the line, the room for
// the graph's own arrows) is kept and rewritten from TypeScript as a plain ES module; the drawing, a framework component
// in the original, is rewritten as an Oomba Figures node tree in the Oomba colors with print, hide and the site's
// languages; typed text (inequalities, points, sequence rules, read by a math input library in the original) is replaced
// by structured data and the formula language Oomba Figures already has; data the original quietly left off the line
// (a point or a term past the end) fails check() instead; a check() and a solve() are added; the interval union is
// taken from the original's inequality reader on its own.
import { node, label, frame, palette, seriesColour, isNum, text, hides, r2 } from '../svg.js';
import { figWords } from '../words.js';
import { evalExpr, exprProblem } from '../../../canvas/src/expr.js';
import { NUMBERINGS, numberLabel, niceLabel, niceText } from './numbering.js';

const NL_LINE = 600;        // the line's length, whatever its range
const NL_FS = 16;           // number font size, at the medium size
const NL_PAD = 16;
const NL_EXT = 22;          // how far the line runs past its last tick, to its arrow
const NL_RAY_EXT = 46;      // the same where the graph runs off that end, to fit its arrow too
const NL_RAY_GAP = 15;      // from the line's arrow tip back to the graph's
const NL_RAY_HEAD = 17;     // length of the graph's arrowhead
const NL_RAY_HALF = 9;      // half its width
const NL_TICK = 9;          // half height of a numbered tick
const NL_MINOR = 5;         // half height of the ticks between numbers
const NL_R = 6.5;           // endpoint circle radius
const NL_LEVEL_GAP = 4;     // between two rows of numbers above the line
const NL_LABEL_GAP = 6;     // the least room between two numbers side by side
const NL_EPS = 1e-9;
const NL_MAX_TICKS = 100;
const NL_MAX_TERMS = 100;
const NL_SIZES = { small: 0.8, medium: 1, large: 1.4 };
const NL_MARKS = ['dot', 'cross'];

/** A value from the data: a number, a fraction [n, d], or a multiple of π { pi: number or [n, d] }. -> { v, form } or null. */
function nlVal(x) {
  if (isNum(x, -1e6, 1e6)) return { v: x, form: '' };
  if (Array.isArray(x) && x.length === 2 && Number.isInteger(x[0]) && Number.isInteger(x[1]) && x[1] !== 0 && Math.abs(x[0]) <= 1e6 && Math.abs(x[1]) <= 1e4) return { v: x[0] / x[1], form: 'fraction' };
  if (x && typeof x === 'object' && !Array.isArray(x) && 'pi' in x) { const k = nlVal(x.pi); return k && k.form !== 'pi' ? { v: k.v * Math.PI, form: 'pi' } : null; }
  return null;
}
const nlSame = (a, b) => Math.abs(a - b) < NL_EPS * Math.max(1, Math.abs(a), Math.abs(b));
const nlEmpty = ({ lo, hi }) => lo.v > hi.v || (nlSame(lo.v, hi.v) && !(lo.closed && hi.closed));
/** Numbers in either set, as few intervals as possible, left to right (an end shared by two is closed if either is). */
export function nlUnion(a, b = []) {
  const sorted = [...a, ...b].filter(i => !nlEmpty(i)).sort((p, q) => p.lo.v - q.lo.v || (q.lo.closed ? 1 : -1));
  const out = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    const touches = last && (i.lo.v < last.hi.v || (nlSame(i.lo.v, last.hi.v) && (i.lo.closed || last.hi.closed)));
    if (!touches) out.push({ lo: { ...i.lo }, hi: { ...i.hi } });
    else if (nlSame(i.hi.v, last.hi.v)) last.hi.closed = last.hi.closed || i.hi.closed;
    else if (i.hi.v > last.hi.v) last.hi = { ...i.hi };
  }
  return out;
}
const nlSet = s => (s === undefined ? 0 : s);
const nlName = (k, i) => `${k} ${i + 1}`;

/**
 * Read the data -> { problems: [...] } or the line: { from, to, step, count, every, numbering, scale, values, intervals:
 * [{ lo: { v, closed }, hi, set, numbering }], points: [{ v, label, mark, coords, set, numbering, from: 'point' | 'graph' }] }.
 */
function nlRead(d) {
  const out = [];
  const from = nlVal(d.from), to = nlVal(d.to), step = nlVal(d.step === undefined ? 1 : d.step);
  if (!from || !to) return { problems: ['"from" and "to" must be numbers (or a fraction [n, d], or { "pi": k } for k × π)'] };
  if (!step || !(step.v > 0)) return { problems: ['"step" (the gap between two ticks) must be a number above 0'] };
  if (!(to.v > from.v)) return { problems: [`the line has to end after it starts: make "to" bigger than ${niceText(from.v, 'decimal')}`] };
  const exact = (to.v - from.v) / step.v, count = Math.round(exact);
  if (Math.abs(exact - count) > 1e-6 * Math.max(1, count)) out.push('(to − from) / step must be a whole number, so the line ends on a tick');
  else if (count > NL_MAX_TICKS) out.push(`that makes ${count} gaps between ticks: count by a bigger "step" (${NL_MAX_TICKS} at most)`);
  const every = d.every === undefined ? 1 : d.every;
  if (!Number.isInteger(every) || every < 0 || every > NL_MAX_TICKS) out.push('"every" must be a whole number: write a number at every nth tick (0 writes none)');
  if (d.numbering !== undefined && !NUMBERINGS.includes(d.numbering)) out.push(`"numbering" must be one of ${NUMBERINGS.join(', ')}`);
  if (d.size !== undefined && !NL_SIZES[d.size]) out.push(`"size" must be one of ${Object.keys(NL_SIZES).join(', ')}`);
  const forms = [from.form, to.form, step.form];
  const numbering = d.numbering || (forms.includes('pi') ? 'pi' : forms.includes('fraction') ? 'fraction' : 'decimal');
  const lo = from.v, hi = to.v, onLine = v => v >= lo - NL_EPS * Math.max(1, Math.abs(lo)) && v <= hi + NL_EPS * Math.max(1, Math.abs(hi));
  const ends = `the line runs from ${niceText(lo, numbering)} to ${niceText(hi, numbering)}: widen the range to show it`;
  const past = v => `${niceText(v, numbering)} is past the end of the line (${ends})`;
  const setOk = (it, at) => { if (it.set !== undefined && !(Number.isInteger(it.set) && it.set >= 0 && it.set <= 4)) out.push(`${at}: "set" must be 0 to 4 (its color)`); };
  const numOk = (it, at) => { if (it.numbering !== undefined && !NUMBERINGS.includes(it.numbering)) out.push(`${at}: "numbering" must be one of ${NUMBERINGS.join(', ')}`); };
  const intervals = [], points = [];
  const list = (k, max) => { const v = d[k]; if (v === undefined) return []; if (!Array.isArray(v) || v.length > max) { out.push(`"${k}" must be a list of at most ${max}`); return []; } return v; };

  list('intervals', 12).forEach((it, i) => {
    const at = nlName('interval', i);
    if (!it || typeof it !== 'object') return out.push(`${at} must be { from, to, fromClosed, toClosed }`);
    const a = it.from === undefined || it.from === null ? null : nlVal(it.from), b = it.to === undefined || it.to === null ? null : nlVal(it.to);
    if ((it.from != null && !a) || (it.to != null && !b)) return out.push(`${at}: "from" and "to" must be numbers (leave one out to run off that end of the line)`);
    if (a && b && !(b.v > a.v)) return out.push(`${at}: "to" must be bigger than "from" (for a single number use "points")`);
    if (!a && it.fromClosed) return out.push(`${at}: an end that runs off the line has no circle, so it cannot be closed`);
    if (!b && it.toClosed) return out.push(`${at}: an end that runs off the line has no circle, so it cannot be closed`);
    for (const e of [a, b]) if (e && !onLine(e.v)) return out.push(`${at}: ${past(e.v)}`);
    setOk(it, at); numOk(it, at);
    const own = (a && a.form) || (b && b.form);
    intervals.push({ lo: a ? { v: a.v, closed: it.fromClosed !== false } : { v: -Infinity, closed: false }, hi: b ? { v: b.v, closed: it.toClosed !== false } : { v: Infinity, closed: false }, set: nlSet(it.set), numbering: it.numbering || own || numbering });
  });
  list('points', 30).forEach((p, i) => {
    const at = nlName('point', i), a = p && typeof p === 'object' ? nlVal(p.at) : null;
    if (!a) return out.push(`${at} needs "at": a number (or a fraction [n, d], or { "pi": k })`);
    if (!onLine(a.v)) return out.push(`${at}: ${past(a.v)}`);
    if (p.mark !== undefined && !NL_MARKS.includes(p.mark)) out.push(`${at}: "mark" must be dot or cross`);
    setOk(p, at); numOk(p, at);
    points.push({ v: a.v, label: text(p.label, 6) || null, mark: p.mark || 'dot', coords: p.value === true, set: nlSet(p.set), numbering: p.numbering || a.form || numbering, from: 'point' });
  });
  if (d.sequence !== undefined) {
    const s = d.sequence, at = 'the sequence';
    if (!s || typeof s !== 'object' || typeof s.expr !== 'string') out.push(`${at} must be { expr: a rule in n like "1/n", from, to }`);
    else {
      const why = exprProblem(s.expr), n0 = s.from === undefined ? 1 : s.from, n1 = s.to === undefined ? 5 : s.to;
      if (why) out.push(`${at}: ${why}`);
      else if (!Number.isInteger(n0) || !Number.isInteger(n1) || n1 < n0) out.push(`${at}: "from" and "to" must be whole numbers with from ≤ to (the terms n = from to to)`);
      else if (n1 - n0 + 1 > NL_MAX_TERMS) out.push(`${at}: that is ${n1 - n0 + 1} terms; show ${NL_MAX_TERMS} at most`);
      else {
        if (s.mark !== undefined && !NL_MARKS.includes(s.mark)) out.push(`${at}: "mark" must be dot or cross`);
        setOk(s, at); numOk(s, at);
        for (let n = n0; n <= n1; n++) {
          let v;
          try { v = evalExpr(s.expr, { n }); } catch (e) { out.push(`${at}: the rule has no value at n = ${n} (${e.message})`); break; }
          if (!onLine(v)) { out.push(`${at}: the term for n = ${n} is ${niceText(v, numbering)}, past the end of the line (${ends})`); break; }
          points.push({ v, label: null, mark: s.mark || 'dot', coords: false, set: nlSet(s.set), numbering: s.numbering || numbering, from: 'graph' });
        }
      }
    }
  }
  if (out.length) return { problems: out };
  return { problems: [], from: lo, to: hi, step: step.v, count, every, numbering, scale: NL_SIZES[d.size || 'medium'], values: d.values !== false, intervals, points };
}

/** Lay the line out as plain numbers (the original's layout): sizes, ticks, numbers, rows of values above, the graph. */
function nlLayout(r, lang) {
  const FS = NL_FS * r.scale, CHAR = FS * 0.6;
  const labelWidth = l => (l.text !== undefined ? l.text : (l.num.length > l.den.length ? l.num : l.den) + l.sign).length * CHAR;
  const { from, to, step, count, every } = r;
  let L = 0;
  const x = v => L + ((v - from) / (to - from)) * NL_LINE;
  const onLine = v => v >= from - NL_EPS && v <= to + NL_EPS;

  // ticks, numbering every nth one counting from the tick at 0 when there is one, so "every 5" gives 0, 5, 10...
  const zero = -from / step, z = Math.round(zero), ref = Math.abs(zero - z) < NL_EPS && z >= 0 && z <= count ? z : 0;
  const ticks = [];
  for (let i = 0; i <= count; i++) {
    const v = i === count ? to : from + i * step, numbered = !!every && (i - ref) % every === 0;
    ticks.push({ v, major: numbered || !every, label: numbered ? numberLabel(v, r.numbering, lang) : null });
  }

  // each set's graph: its intervals joined, an endpoint shared by two of them drawn once, closed if either is
  const sets = [...new Set([...r.intervals.map(i => i.set), ...r.points.map(p => p.set)])].sort((a, b) => a - b);
  const drawn = sets.map(set => {
    const parts = nlUnion(r.intervals.filter(i => i.set === set));
    const ends = new Map();   // value -> { closed, graph, point }
    const put = (v, closed, kind) => { const k = [...ends.keys()].find(w => nlSame(w, v)); const e = k === undefined ? { closed: false, graph: false, point: false } : ends.get(k); e.closed = e.closed || closed; e[kind] = true; if (k === undefined) ends.set(v, e); };
    for (const { lo, hi } of parts) for (const b of [lo, hi]) if (Number.isFinite(b.v) && onLine(b.v)) put(b.v, b.closed, 'graph');
    const pts = r.points.filter(p => p.set === set);
    for (const p of pts) if (p.mark !== 'cross') put(p.v, true, p.from === 'point' ? 'point' : 'graph');
    return { set, parts, ends, crosses: pts.filter(p => p.mark === 'cross'), labeled: pts.filter(p => p.label) };
  });
  const crosses = drawn.flatMap(g => g.crosses.map(p => p.v));

  // above the line: each point's letter, and the value of any endpoint or unlabeled point that has no number under it,
  // so the figure is never ambiguous (unless values are turned off). A lettered point's value is not written: it would
  // give the answer away (unless "value: true" asks for it, as P(3/4)).
  const pointLabels = drawn.flatMap(g => g.labeled.map(p => ({ v: p.v, text: p.label, coords: p.coords ? `(${niceText(p.v, p.numbering, lang)})` : '', set: g.set })))
    .filter((p, i, all) => all.findIndex(q => nlSame(q.v, p.v) && q.text === p.text) === i);
  const onNumber = v => ticks.some(t => t.label && nlSame(t.v, v));
  const written = !r.values ? [] : [
    ...r.points.filter(p => !p.label).map(p => ({ v: p.v, numbering: p.numbering })),
    ...r.intervals.flatMap(i => [i.lo.v, i.hi.v].filter(Number.isFinite).map(v => ({ v, numbering: i.numbering }))),
  ].filter(({ v }, i, all) => onLine(v) && all.findIndex(w => nlSame(w.v, v)) === i);
  const above = [
    ...written.filter(({ v }) => !onNumber(v) && !pointLabels.some(p => nlSame(p.v, v))).map(({ v, numbering }) => ({ v, label: niceLabel(v, numbering, lang) })),
    ...pointLabels.map(point => ({ v: point.v, point })),
  ].sort((a, b) => a.v - b.v);
  const aboveWidth = a => (a.label ? labelWidth(a.label) : (a.point.text.length * 1.2 + a.point.coords.length) * CHAR);

  const labels = ticks.filter(t => t.label);
  const stacked = labels.some(l => l.label.den), aboveStacked = above.some(a => a.label && a.label.den);
  const numbersH = labels.length ? (stacked ? FS * 2.3 : FS) + 6 : 0;

  // a part of the graph that runs off an end has its own arrow there, before the line's arrow, so the line runs on
  // further at that end to fit both
  const allParts = drawn.flatMap(g => g.parts);
  const rayL = allParts.some(({ lo }) => lo.v < from - NL_EPS), rayR = allParts.some(({ hi }) => hi.v > to + NL_EPS);
  const extL = rayL ? NL_RAY_EXT : NL_EXT, extR = rayR ? NL_RAY_EXT : NL_EXT;
  const first = labels.find(l => nlSame(l.v, from)), last = labels.find(l => nlSame(l.v, to));
  L = NL_PAD + Math.max(extL, first ? labelWidth(first.label) / 2 : 0);
  const Rt = NL_PAD + Math.max(extR, last ? labelWidth(last.label) / 2 : 0);

  // numbers above the line that would overlap sit in rows, each on the lowest row with room, counting up from the line
  const rowEnds = [];
  const levels = above.map(a => {
    const half = aboveWidth(a) / 2;
    let level = rowEnds.findIndex(end => x(a.v) - half >= end + NL_LABEL_GAP);
    if (level === -1) level = rowEnds.push(0) - 1;
    rowEnds[level] = x(a.v) + half;
    return level;
  });
  const LABEL_FS = FS * 1.2;   // a point's letter is a little larger than the numbers, as on the coordinate grid
  const levelH = Math.max(aboveStacked ? FS * 2.3 : FS, pointLabels.length ? LABEL_FS : 0);
  const aboveH = rowEnds.length ? rowEnds.length * levelH + (rowEnds.length - 1) * NL_LEVEL_GAP + 8 : 0;
  const axisY = NL_PAD + aboveH + Math.max(NL_TICK, NL_R + 2);
  const height = axisY + NL_TICK + 6 + numbersH + NL_PAD, width = L + NL_LINE + Rt;
  const ends = { left: L - extL, right: L + NL_LINE + extR }, tips = { left: ends.left + NL_RAY_GAP, right: ends.right - NL_RAY_GAP };

  // numbers sit in a row starting at top; a row with any stacked fraction is taller
  const row = (list, top, tall) => list.map(({ v, label: l }) => (l.den
    ? { x: x(v), sign: l.sign, num: l.num, den: l.den, numY: top + FS * 0.85, barY: top + FS * 1.1, denY: top + FS * 2.05 }
    : { x: x(v), text: l.text, y: tall ? top + FS * 1.45 : top + FS * 0.85 }));
  const aboveTop = level => axisY - Math.max(NL_TICK, NL_R + 2) - 6 - (level + 1) * levelH - level * NL_LEVEL_GAP;
  const numbers = row(labels, axisY + NL_TICK + 6, stacked);
  const values = rowEnds.flatMap((_, level) => row(above.filter((a, i) => a.label && levels[i] === level), aboveTop(level), aboveStacked));
  const labelY = level => aboveTop(level) + levelH / 2 + LABEL_FS * 0.35;
  const letters = above.flatMap((a, i) => (a.point ? [{ x: x(a.v), y: labelY(levels[i]), text: a.point.text, coords: a.point.coords, set: a.point.set }] : []));

  return {
    width, height, fs: FS, labelFs: LABEL_FS, axis: { x1: ends.left, x2: ends.right, y: axisY },
    // a cross replaces the tick it sits on, which would otherwise turn it into a star
    ticks: ticks.filter(t => !crosses.some(v => nlSame(t.v, v))).map(t => ({ x: x(t.v), major: t.major })),
    numbers, values, letters,
    groups: drawn.map(g => {
      const segments = [];
      for (const { lo, hi } of g.parts) {
        const x1 = lo.v < from - NL_EPS ? tips.left + NL_RAY_HEAD - 1 : x(lo.v), x2 = hi.v > to + NL_EPS ? tips.right - NL_RAY_HEAD + 1 : x(hi.v);
        if (x2 > x1) segments.push({ x1, x2 });
      }
      return {
        set: g.set, segments,
        arrows: [g.parts.some(({ lo }) => lo.v < from - NL_EPS) && { tip: tips.left, dir: -1 }, g.parts.some(({ hi }) => hi.v > to + NL_EPS) && { tip: tips.right, dir: 1 }].filter(Boolean),
        ends: [...g.ends].map(([v, e]) => ({ x: x(v), ...e })),
        crosses: g.crosses.map(p => ({ x: x(p.v), from: p.from })),
      };
    }),
  };
}

/**
 * { from, to, step?: 1, every?: 1 (a number at every nth tick, counting from 0; 0 writes none), numbering?: 'decimal' |
 * 'fraction' | 'pi' | 'degree' (from the values' form when left out), size?: 'small' | 'medium' | 'large', values?: false
 * (write no values above the line), intervals?: [{ from?, to?, fromClosed?: true, toClosed?: true, set? }] (leave out an
 * end to run off the line with an arrow), points?: [{ at, label?, value?: true (write its value after the letter), mark?:
 * 'dot' | 'cross', set? }], sequence?: { expr: '1/n', from?: 1, to?: 5, mark?, set? } }. Values: a number, a fraction
 * [n, d] or { pi: k }. set: 0 to 4, the color (green, blue, red, gold, purple); one set's intervals join.
 * hide: true (the numbered line only), 'graph' (no intervals, no sequence), 'points', 'values' (no values above).
 */
export const numberLine = {
  check(d) { return nlRead(d).problems; },
  draw(d, o) {
    const P = palette(o), lang = o.lang, W = figWords(lang), r = nlRead(d), g = nlLayout(r, lang), ay = g.axis.y, FS = g.fs;
    const blank = o.hide === true, noGraph = blank || hides(o, 'graph'), noPoints = blank || hides(o, 'points'), noValues = blank || hides(o, 'values');
    const kids = [];
    // the line and its arrows
    const head = (tip, dir, c, len, half, cls) => node('polygon', { points: `${r2(tip)},${r2(ay)} ${r2(tip - dir * len)},${r2(ay - half)} ${r2(tip - dir * len)},${r2(ay + half)}`, fill: c, class: cls || null });
    kids.push(node('line', { x1: g.axis.x1, y1: ay, x2: g.axis.x2, y2: ay, stroke: P.ink, 'stroke-width': 2.4 }), head(g.axis.x1 - 2.6, -1, P.ink, 13, 6.5), head(g.axis.x2 + 2.6, 1, P.ink, 13, 6.5));
    kids.push(node('g', { stroke: P.ink, 'stroke-width': 2, class: 'of-ticks' }, g.ticks.map(t => node('line', { x1: t.x, y1: ay - (t.major ? NL_TICK : NL_MINOR), x2: t.x, y2: ay + (t.major ? NL_TICK : NL_MINOR) }))));
    // each set's graph and points, later sets over earlier ones
    for (const grp of g.groups) {
      const c = seriesColour(o, grp.set);
      if (!noGraph) {
        if (grp.segments.length) kids.push(node('g', { stroke: c, 'stroke-width': 6, class: 'of-graph' }, grp.segments.map(s => node('line', { x1: s.x1, y1: ay, x2: s.x2, y2: ay }))));
        for (const a of grp.arrows) kids.push(head(a.tip, a.dir, c, NL_RAY_HEAD, NL_RAY_HALF, 'of-ray'));
      }
      for (const cx of grp.crosses) if (cx.from === 'point' ? !noPoints : !noGraph) kids.push(node('path', { d: `M${r2(cx.x - 7)},${r2(ay - 7)} L${r2(cx.x + 7)},${r2(ay + 7)} M${r2(cx.x - 7)},${r2(ay + 7)} L${r2(cx.x + 7)},${r2(ay - 7)}`, stroke: c, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none', class: 'of-cross' }));
      for (const e of grp.ends) {
        const show = (e.graph && !noGraph) || (e.point && !noPoints);
        // a point closes the circle it sits on; with the graph hidden, only the point's own (closed) dot is left
        const closed = e.point && !noPoints ? true : e.closed;
        if (show) kids.push(node('circle', { cx: e.x, cy: ay, r: NL_R, fill: closed ? c : P.paper, stroke: c, 'stroke-width': 2.5, class: closed ? 'of-end of-closed' : 'of-end of-open' }));
      }
    }
    // the numbers under the line, and the values above it
    const num = (n, cls) => (n.den !== undefined
      ? (() => { const half = Math.max(n.num.length, n.den.length) * FS * 0.32; return node('g', { class: cls }, label(n.x, n.numY, n.num, { anchor: 'middle', size: FS, baseline: 'alphabetic', color: P.ink }), node('line', { x1: n.x - half - 1, y1: n.barY, x2: n.x + half + 1, y2: n.barY, stroke: P.ink, 'stroke-width': 1.5 }), label(n.x, n.denY, n.den, { anchor: 'middle', size: FS, baseline: 'alphabetic', color: P.ink }), n.sign ? label(n.x - half - 3, n.barY + FS * 0.35, n.sign, { anchor: 'end', size: FS, baseline: 'alphabetic', color: P.ink }) : null); })()
      : node('g', { class: cls }, label(n.x, n.y, n.text, { anchor: 'middle', size: FS, baseline: 'alphabetic', color: P.ink })));
    kids.push(node('g', { class: 'of-numbers' }, g.numbers.map(n => num(n, 'of-num'))));
    if (!noValues) kids.push(node('g', { class: 'of-values' }, g.values.map(n => num(n, 'of-val'))));
    // the points' letters, italic as in print, a value after a letter upright
    if (!noPoints) for (const l of g.letters) {
      kids.push(node('text', { x: l.x, y: l.y, 'text-anchor': 'middle', 'font-size': g.labelFs, 'font-weight': 700, fill: seriesColour(o, l.set), stroke: P.paper, 'stroke-width': 4, 'paint-order': 'stroke', 'stroke-linejoin': 'round', class: 'of-letter' },
        node('tspan', { 'font-style': 'italic', 'font-family': 'Georgia, "Times New Roman", serif' }, l.text), l.coords ? node('tspan', { 'font-size': FS }, l.coords) : null));
    }
    return frame(g.width, g.height, kids, { ...o, kind: 'numberLine' }, o.title || W('numberLine'));
  },
  /** The numbers behind the drawing: the ticks (and which are numbered), each set's intervals joined, the points and the
   *  sequence's terms (null for an end that runs off the line). */
  solve(d) {
    const r = nlRead(d);
    if (r.problems.length) return null;
    const ticks = [], zero = -r.from / r.step, z = Math.round(zero), ref = Math.abs(zero - z) < NL_EPS && z >= 0 && z <= r.count ? z : 0;
    for (let i = 0; i <= r.count; i++) ticks.push({ at: i === r.count ? r.to : r.from + i * r.step, numbered: !!r.every && (i - ref) % r.every === 0 });
    const sets = [...new Set(r.intervals.map(i => i.set))].sort((a, b) => a - b).map(set => ({
      set, intervals: nlUnion(r.intervals.filter(i => i.set === set)).map(({ lo, hi }) => ({ from: Number.isFinite(lo.v) ? lo.v : null, to: Number.isFinite(hi.v) ? hi.v : null, fromClosed: lo.closed, toClosed: hi.closed })),
    }));
    return {
      from: r.from, to: r.to, step: r.step, numbering: r.numbering, ticks, sets,
      points: r.points.filter(p => p.from === 'point').map(p => ({ at: p.v, label: p.label, set: p.set })),
      terms: r.points.filter(p => p.from === 'graph').map(p => p.v),
      /** Is x in this set's numbers? */
      contains: (x, set = 0) => (sets.find(s => s.set === set) || { intervals: [] }).intervals.some(i => (i.from === null || x > i.from || (i.fromClosed && nlSame(x, i.from))) && (i.to === null || x < i.to || (i.toClosed && nlSame(x, i.to)))),
    };
  },
};

export const NUMBER_LINES = { numberLine };
