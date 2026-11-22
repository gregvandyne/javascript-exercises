// Oomba Figures: segment addition. Points in order on one line, each part between neighbors drawn at its true length,
// with its length or an expression in one letter (2x + 1) above it, congruence ticks, braces under the line for spans
// (AC = AB + BC), a midpoint shown by equal ticks, and a line crossing at a point (a bisector). An expression is data,
// a·x + b as [a, b] with the letter's value given (unknown: { x: 6 }), so every length and every label can be worked
// out and checked: a part is as long as its expression says, a span's label is the sum of its parts, ticks claim equal
// parts only where they are equal. The layout is ported/segments.js.
import { node, isNum, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { mathBox, mathText, mathProblem } from './mathtext.js';
import { gmCommon, gmClaim, gmAgrees, gmLabelProblem, gmCount, gmRound, gmName, gmMarkClaims, gmDraw } from './lines.js';
import { layoutSegments } from './ported/segments.js';

const SEG_MAX_POINTS = 7;
const SEG_KEYS = ['kind', 'hide', 'points', 'parts', 'spans', 'unknown', 'start', 'end', 'cross', 'unit', 'round', 'size', 'turn', 'notToScale', 'drawAs'];

/** a·x + b written as a math label: 2x + 1, x − 4, −x, 3. */
function segExprLabel([a, b], letter) {
  const out = [];
  if (a === 1) out.push(letter);
  else if (a === -1) out.push(`-${letter}`);
  else out.push(a, letter);
  if (b) out.push(b > 0 ? ' + ' : ' - ', Math.abs(b));
  return out;
}
const segIsExpr = e => Array.isArray(e) && e.length === 2 && e.every(v => isNum(v, -1e6, 1e6)) && e[0] !== 0;

function segRead(d) {
  const out = [];
  const odd = Object.keys(d).filter(k => !SEG_KEYS.includes(k));
  if (odd.length) return { problems: [`segmentAddition does not take "${odd[0]}" (it takes ${SEG_KEYS.slice(2).join(', ')})`] };
  const c = gmCommon(d, out);
  if (d.turn !== undefined && !isNum(d.turn, -90, 90)) out.push('"turn" for a segment must be degrees from −90 to 90 (its labels stay upright)');
  if (!Array.isArray(d.points) || d.points.length < 2 || d.points.length > SEG_MAX_POINTS) return { problems: [...out, `"points" must list 2 to ${SEG_MAX_POINTS} points in order, like ["A", "B", "C"] or [{ "name": "A" }]`] };
  const points = d.points.map((p, i) => {
    const o = typeof p === 'string' || typeof p === 'number' ? { name: p } : p && typeof p === 'object' && !Array.isArray(p) ? p : null;
    if (!o) { out.push(`point ${i + 1} must be a name, or { "name", "dot" }`); return { name: '' }; }
    if (o.name !== undefined && mathProblem(o.name, `the name of point ${i + 1}`)) out.push(mathProblem(o.name, `the name of point ${i + 1}`));
    if (o.dot !== undefined && typeof o.dot !== 'boolean') out.push(`point ${i + 1}: "dot" must be true or false`);
    return { name: o.name === undefined ? '' : o.name, dot: o.dot !== false };
  });
  const pname = i => (points[i].name !== '' ? mathText(points[i].name) : `point ${i + 1}`);
  const partName = i => (points[i].name !== '' && points[i + 1].name !== '' ? `${pname(i)}${pname(i + 1)}` : `part ${i + 1}`);
  const pointIx = v => (Number.isInteger(v) && v >= 0 && v < points.length ? v : points.findIndex(p => p.name !== '' && p.name === v));
  // the unknown: one letter and its value
  let letter = null, value = null;
  if (d.unknown !== undefined) {
    const ks = d.unknown && typeof d.unknown === 'object' && !Array.isArray(d.unknown) ? Object.keys(d.unknown) : [];
    if (ks.length !== 1 || !/^[a-zA-Z]$/.test(ks[0]) || !isNum(d.unknown[ks[0]], -1e6, 1e6)) out.push('"unknown" must be one letter and its value, like { "x": 6 } (the value the expressions are worked out at)');
    else [letter, value] = [ks[0], d.unknown[ks[0]]];
  }
  const n = points.length - 1;
  if (!Array.isArray(d.parts) || d.parts.length !== n) return { problems: [...out, `"parts" must list ${n} parts, one between each pair of neighboring points: { "length": 5 } or { "expr": [2, 1] } (2x + 1)`] };
  const parts = d.parts.map((p, i) => {
    const at = `part ${partName(i)}`;
    const o = isNum(p) ? { length: p } : p && typeof p === 'object' && !Array.isArray(p) ? p : null;
    if (!o) { out.push(`${at} must be { "length" } or { "expr" }`); return null; }
    const o2 = Object.keys(o).filter(k => !['length', 'expr', 'label', 'ticks'].includes(k));
    if (o2.length) out.push(`${at} does not take "${o2[0]}" (it takes length, expr, label, ticks)`);
    if ((o.length === undefined) === (o.expr === undefined)) { out.push(`${at} needs exactly one of "length" (a number) and "expr" ([a, b] for a·x + b)`); return null; }
    if (o.ticks !== undefined && !gmCount(o.ticks)) out.push(`${at}: "ticks" must be 0 to 3`);
    const why = gmLabelProblem(o.label, `the label of ${at}`); if (why) out.push(why);
    if (o.length !== undefined) { if (!isNum(o.length, 1e-6, 1e6)) { out.push(`${at}: "length" must be a number above 0`); return null; } return { length: o.length, label: o.label === undefined ? true : o.label, ticks: o.ticks || 0, name: partName(i) }; }
    if (!segIsExpr(o.expr)) { out.push(`${at}: "expr" must be [a, b] for a·x + b, with a not 0`); return null; }
    if (letter === null) { out.push(`${at} has an expression, so the figure needs "unknown": the letter and its value, like { "x": 6 }`); return null; }
    const len = o.expr[0] * value + o.expr[1];
    if (!(len > 1e-9)) { out.push(`${at}: with ${letter} = ${value}, ${mathText(segExprLabel(o.expr, letter))} is ${String(r2(len)).replace('-', '−')}, and a length has to be more than 0`); return null; }
    return { length: len, expr: o.expr, label: o.label === undefined ? segExprLabel(o.expr, letter) : o.label === true ? segExprLabel(o.expr, letter) : o.label, ticks: o.ticks || 0, name: partName(i) };
  });
  if (out.length || parts.some(p => !p)) return { problems: out };
  const sumOf = (a, b) => parts.slice(a, b).reduce((t, p) => t + p.length, 0);
  const spans = [];
  if (d.spans !== undefined && !Array.isArray(d.spans)) out.push('"spans" must be a list, like [{ "from": "A", "to": "C", "label": true }]');
  for (const [k, s] of (Array.isArray(d.spans) ? d.spans : []).entries()) {
    const at = `span ${k + 1}`;
    if (!s || typeof s !== 'object' || Array.isArray(s)) { out.push(`${at} must be { "from", "to", "label" }`); continue; }
    const o2 = Object.keys(s).filter(x => !['from', 'to', 'label', 'expr'].includes(x));
    if (o2.length) { out.push(`${at} does not take "${o2[0]}" (it takes from, to, label, expr)`); continue; }
    let a = pointIx(s.from), b = pointIx(s.to);
    if (a < 0 || b < 0 || a === b) { out.push(`${at}: "from" and "to" must be two different points (their names, or places from 0)`); continue; }
    if (a > b) [a, b] = [b, a];
    const why = gmLabelProblem(s.label, `the label of ${at}`); if (why) out.push(why);
    if (s.expr !== undefined && (!segIsExpr(s.expr) || letter === null)) { out.push(`${at}: "expr" must be [a, b] for a·x + b, and the figure needs "unknown"`); continue; }
    if (s.expr !== undefined && s.label !== undefined) { out.push(`${at}: give "label" or "expr", not both`); continue; }
    spans.push({ from: a, to: b, length: sumOf(a, b), expr: s.expr, label: s.expr ? segExprLabel(s.expr, letter) : s.label === undefined ? true : s.label, name: `${pname(a)}${pname(b)}` });
  }
  if (spans.length > 3) out.push('at most 3 spans');
  for (const k of ['start', 'end']) if (d[k] !== undefined && !['none', 'arrow'].includes(d[k])) out.push(`"${k}" must be "none" (the segment stops at its point) or "arrow" (it runs on: a ray or a line)`);
  let cross = null;
  if (d.cross !== undefined) {
    const x = d.cross, at = x && pointIx(x.at);
    if (!x || typeof x !== 'object' || at < 0 || at === undefined) out.push('"cross" must be { "at": a point, "angle": 90, "name" } (a line crossing there)');
    else if (x.angle !== undefined && !isNum(x.angle, 20, 160)) out.push('"cross": "angle" must be from 20 to 160 degrees');
    else if (x.name !== undefined && mathProblem(x.name, 'the crossing line\'s name')) out.push(mathProblem(x.name, 'the crossing line\'s name'));
    else cross = { at, angle: x.angle === undefined ? 90 : x.angle, name: x.name };
  }
  let drawn = parts.map(p => p.length);
  if (d.drawAs !== undefined) {
    if (!c.notToScale) out.push('"drawAs" only goes with notToScale: true (a figure drawn to scale is drawn from its own lengths)');
    else if (!Array.isArray(d.drawAs) || d.drawAs.length !== n || d.drawAs.some(v => !isNum(v, 1e-6, 1e6))) out.push(`"drawAs" must list ${n} lengths to draw instead, one for each part`);
    else drawn = d.drawAs.slice();
  }
  if (out.length) return { problems: out };
  // the truth: each stated number is the true length, each span's expression its parts' sum, ticks on equal parts
  const problems = [];
  const check = (x, label) => {
    const cl = label === true || label === false || Array.isArray(label) && x.expr ? null : gmClaim(label, c.unit);
    if (cl !== null && !gmAgrees(cl, x.length, false)) problems.push(`${x.name} is labeled ${mathText(label)} but it is ${r2(x.length)}: a label that states a number must state the true length`);
  };
  parts.forEach(p => check(p, p.label));
  for (const s of spans) {
    if (s.expr) { const v = s.expr[0] * value + s.expr[1]; if (!gmAgrees(v, s.length, false)) problems.push(`${s.name} is labeled ${mathText(s.label)}, which is ${r2(v)} with ${letter} = ${value}, but its parts add up to ${r2(s.length)}`); }
    else check(s, s.label);
  }
  problems.push(...gmMarkClaims(parts.map(p => ({ ...p, count: p.ticks })), p => p.length, p => p.name, 'ticks claim equal parts', false));
  if (c.notToScale) problems.push(...gmMarkClaims(parts.map((p, i) => ({ ...p, count: p.ticks, i })), p => drawn[p.i], p => p.name, 'ticks claim equal parts', false, ' as drawn (drawAs)'));
  if (problems.length) return { problems };
  return { problems: [], c, points, parts, spans, letter, value, cross, drawn, start: d.start || 'none', end: d.end || 'none' };
}
export const segmentAddition = {
  check(d) { return segRead(d).problems; },
  /** The numbers: the unknown's value, each part's length, each span's length, the whole length, where each point is
   *  along the line, and which points are midpoints (of the whole, of a span, or of its two neighbors). */
  solve(d) {
    const r = segRead(d);
    if (r.problems.length) return null;
    const at = [0];
    for (const p of r.parts) at.push(at[at.length - 1] + p.length);
    const midpoints = [];
    for (let i = 1; i < at.length - 1; i++) for (let a = 0; a < i; a++) for (let b = i + 1; b < at.length; b++) if (Math.abs(at[i] - at[a] - (at[b] - at[i])) < 1e-9 * Math.max(1, at[b])) midpoints.push({ point: i, from: a, to: b });
    return { unknown: r.letter ? { [r.letter]: r.value } : null, parts: r.parts.map(p => p.length), spans: r.spans.map(s => s.length), total: at[at.length - 1], at, midpoints };
  },
  draw(d, o) {
    const r = segRead(d), c = r.c, lang = o.lang, W = figWords(lang), FS = 21 * c.scale, unit = c.unit ? ` ${c.unit}` : '';
    const hidden = p => o.hide === true || hides(o, p);
    const box = (x, l, group) => {
      if (l === false || hidden(x.name) || hidden(group)) return null;
      if (l === true) return mathBox(gmRound(x.length, c.round), FS, { lang, suffix: unit });
      return mathBox(l, FS, { lang, suffix: typeof l === 'number' ? unit : undefined });
    };
    const L = layoutSegments({
      sizes: r.drawn, parts: r.parts.map(p => ({ box: box(p, p.label, 'parts'), ticks: p.ticks })),
      points: r.points.map(p => ({ box: gmName(p.name, c.scale, lang), dot: p.dot })),
      spans: r.spans.map(s => ({ from: s.from, to: s.to, box: box(s, s.label, 'spans') })),
      start: r.start, end: r.end, turn: c.turn,
      cross: r.cross && { at: r.cross.at, angle: r.cross.angle, square: c.rightAngles && Math.abs(r.cross.angle - 90) < 1e-9, box: gmName(r.cross.name, c.scale, lang) },
    });
    L.curves = L.braces.map((b, i) => ({ id: `brace${i}`, d: b, width: 1.8, cls: 'of-brace' }));
    return gmDraw(L, o, 'segmentAddition', o.title || W('segmentAddition'), { notToScale: c.notToScale });
  },
};
export const SEGMENT_KINDS = { segmentAddition };
