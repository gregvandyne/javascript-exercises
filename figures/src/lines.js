// Oomba Figures: lines and angles. Two kinds: angles (rays from one vertex: a single angle, angle pairs, angles round a
// point, vertical angles where two lines cross) and parallelLines (parallel lines cut by transversals, with the eight
// angles and their relationships; a line can be tilted off parallel, for "are these lines parallel?"). Every ray and
// line is drawn at its true direction, so every angle on the figure is its measure; a label that states a number states
// the true one, arcs claim equal angles only where they are equal, a right angle carries its square, and parallel arrows
// go only on lines that really are parallel. The layout is ported/lines.js; the labels are typeset as math (mathtext.js).
import { node, frame, palette, isNum, text, hides, r2, label } from './svg.js';
import { figWords } from './words.js';
import { mathBox, mathNode, mathText, mathProblem, mathValue } from './mathtext.js';
import { layoutLinesFigure } from './ported/lines.js';

export const GM_SIZES = { small: 0.8, medium: 1, large: 1.4 };
export const GM_ANGLE_SLACK = 0.5;   // degrees: teachers give rounded values
export const GM_SIDE_SLACK = 0.01;   // 1% of a length
const GM_DASH = { solid: null, dashed: '7 5', dotted: '0.01 5' };
const GM_NOTE_H = 30;

/** The number a label states (a trailing unit or degree sign set aside), or null when it states none. */
export function gmClaim(l, unit) {
  if (typeof l === 'string') {
    const s = l.trim().replace(/°$/, '').trim();
    return mathValue(unit && s.endsWith(unit) ? s.slice(0, -unit.length).trim() : s);
  }
  return mathValue(l);
}
/** Does a stated number agree with the true value (half a degree for an angle, 1% for a length)? */
export const gmAgrees = (c, v, isAngle) => (isAngle ? Math.abs(c - v) <= GM_ANGLE_SLACK : Math.abs(c - v) <= GM_SIDE_SLACK * Math.max(Math.abs(v), 1e-9));
/** A label's problem (it must be true, false or a math label), or null. */
export const gmLabelProblem = (l, at) => (l === true || l === false || l === undefined ? null : mathProblem(l, at));
/** A count of marks: 0 to 3. */
export const gmCount = v => Number.isInteger(v) && v >= 0 && v <= 3;
/** A number rounded for a label. */
export const gmRound = (v, dp) => Number(v.toFixed(dp));
/** The common options every geometry kind reads: size, round, turn, rightAngles, notToScale. */
export function gmCommon(d, out, o = {}) {
  if (d.size !== undefined && !GM_SIZES[d.size]) out.push(`"size" must be one of ${Object.keys(GM_SIZES).join(', ')}`);
  if (d.round !== undefined && ![0, 1, 2].includes(d.round)) out.push('"round" must be 0, 1 or 2 (decimal places for the measures it works out)');
  if (d.turn !== undefined && !isNum(d.turn, -180, 180)) out.push('"turn" must be degrees from −180 to 180');
  for (const k of ['rightAngles', 'notToScale', ...(o.bools || [])]) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
  if (d.unit !== undefined && (typeof d.unit !== 'string' || d.unit.length > 12)) out.push('"unit" must be short text, like "cm" or "in"');
  return { scale: GM_SIZES[d.size] || 1, round: d.round === undefined ? 1 : d.round, turn: d.turn || 0, rightAngles: d.rightAngles !== false, notToScale: d.notToScale === true, unit: typeof d.unit === 'string' ? text(d.unit, 12) : '' };
}
/** What a label shows: { box } for a part whose label is l (true: its measure value, with suffix), or null. */
export function gmBox(l, value, o) {
  if (l === undefined || l === false || l === null) return null;
  const size = 20 * (o.scale || 1);
  if (l === true) return value === null || value === undefined ? null : mathBox(o.typed ?? gmRound(value, o.round ?? 1), size, { lang: o.lang, suffix: o.suffix });
  // a plain number on an angle is in degrees: written with its sign
  return mathBox(l, size, { lang: o.lang, suffix: o.suffix === '°' && typeof l === 'number' ? '°' : undefined });
}
/** A point's or line's name, laid out. */
export const gmName = (nm, scale, lang) => (nm === '' || nm === null || nm === undefined ? null : mathBox(nm, 21 * scale, { lang }));
/** Groups of marks (a count per item) that claim their items' values are equal: the problems where they are not. */
export function gmMarkClaims(items, valueOf, nameOf, claim, isAngle, what = '') {
  const by = {}, out = [];
  for (const it of items) if (it.count) (by[it.count] = by[it.count] || []).push(it);
  for (const g of Object.values(by)) for (const it of g.slice(1)) {
    const a = valueOf(g[0]), b = valueOf(it);
    if (!gmAgrees(a, b, isAngle)) out.push(`${claim} ${nameOf(g[0])} and ${nameOf(it)}, but${what} they are not (${nameOf(g[0])}: ${r2(a)}${isAngle ? '°' : ''}, ${nameOf(it)}: ${r2(b)}${isAngle ? '°' : ''})`);
  }
  return out;
}

/**
 * Draw a laid-out figure (ported/lines.js and the layouts like it): lines, arrowheads, marks, dots, ticks and labels,
 * in the frame the layout made, with "Not drawn to scale" under it when asked. extra: nodes drawn under the lines.
 */
export function gmDraw(L, o, kind, title, opts = {}) {
  const P = palette(o), X = r2, pts = list => list.map(([x, y]) => `${X(x)},${X(y)}`).join(' ');
  const kids = [...(opts.under || [])];
  for (const g of L.segments) kids.push(node('line', { x1: X(g.from[0]), y1: X(g.from[1]), x2: X(g.to[0]), y2: X(g.to[1]), stroke: g.color || P.ink, 'stroke-width': g.width || 2.2, 'stroke-linecap': g.style === 'dotted' ? 'round' : 'butt', 'stroke-dasharray': GM_DASH[g.style] || null, class: g.cls || 'of-line', 'data-part': g.id }));
  for (const c of L.curves || []) kids.push(node('path', { d: c.d, fill: 'none', stroke: c.color || P.ink, 'stroke-width': c.width || 2.2, 'stroke-dasharray': GM_DASH[c.style] || null, class: c.cls || 'of-curve', 'data-part': c.id || null }));
  kids.push(node('g', { fill: P.ink, class: 'of-heads' }, L.heads.map(h => node('polygon', { points: pts(h), class: 'of-head' }))));
  kids.push(node('g', { fill: 'none', stroke: P.ink, 'stroke-width': 1.6, class: 'of-marks' },
    L.squares.map(s => node('polyline', { points: pts(s), class: 'of-square' })),
    L.arcs.map(a => node('path', { d: a, class: 'of-arc' })),
    (L.ticks || []).map(([p, q]) => node('line', { x1: X(p[0]), y1: X(p[1]), x2: X(q[0]), y2: X(q[1]), 'stroke-width': 1.8, class: 'of-tick' })),
    L.arrows.map(a => node('polyline', { points: pts(a), 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'of-arrow' }))));
  for (const [x, y] of L.dots) kids.push(node('circle', { cx: X(x), cy: X(y), r: 3.5, fill: P.ink, class: 'of-dot' }));
  for (const l of L.labels) {
    const name = /^(pt|name|v|o|cross)/.test(l.part);
    kids.push(node('g', { class: name ? 'of-name' : 'of-label', 'data-part': l.part }, mathNode(l.box, X(l.x), X(l.y), { color: P.ink, halo: o.print ? null : P.paper })));
  }
  const F = L.frame, all = [node('g', { transform: `translate(${r2(-F.x)} ${r2(-F.y)})` }, kids)];
  let h = F.h;
  if (opts.notToScale) {
    all.push(node('g', { class: 'of-note' }, label(F.w / 2, F.h + GM_NOTE_H / 2 - 4, figWords(o.lang)('notToScale'), { anchor: 'middle', size: 15, weight: 400, color: P.ink2, italic: true })));
    h += GM_NOTE_H;
  }
  return frame(F.w, h, all, { ...o, kind }, title);
}

// ---------------------------------------------------------------- angles
const ANG_MAX_RAYS = 8;
const ANG_RAD = Math.PI / 180;
const angAround = v => ((v % 360) + 360) % 360;
const angDir = deg => [Math.cos(deg * ANG_RAD), Math.sin(deg * ANG_RAD)];
const ANG_KEYS = ['kind', 'hide', 'rays', 'angles', 'vertex', 'arrows', 'size', 'round', 'turn', 'rightAngles', 'notToScale', 'drawAs'];

/** Read the rays: [deg] or [{ dir, name, arrow }] -> list, or problems. */
function angRays(list, out, at) {
  if (!Array.isArray(list) || list.length < 2 || list.length > ANG_MAX_RAYS) { out.push(`${at}"rays" must list 2 to ${ANG_MAX_RAYS} rays: directions in degrees (0 to the right, counterclockwise), or { "dir", "name" }`); return null; }
  const rays = [];
  list.forEach((r, i) => {
    const o = isNum(r) ? { dir: r } : r && typeof r === 'object' && !Array.isArray(r) ? r : null;
    if (!o || !isNum(o.dir, 0, 360) || o.dir >= 360) { out.push(`${at}ray ${i + 1} needs a direction "dir" from 0 up to 360 degrees`); return; }
    const odd = Object.keys(o).filter(k => !['dir', 'name', 'arrow'].includes(k));
    if (odd.length) out.push(`${at}ray ${i + 1} does not take "${odd[0]}" (it takes dir, name, arrow)`);
    if (o.name !== undefined && mathProblem(o.name, `the name of ray ${i + 1}`)) out.push(mathProblem(o.name, `the name of ray ${i + 1}`));
    if (o.arrow !== undefined && typeof o.arrow !== 'boolean') out.push(`${at}ray ${i + 1}: "arrow" must be true or false`);
    if (rays.some(x => Math.abs(angAround(x.dir - o.dir + 180) - 180) < 1e-6)) out.push(`${at}ray ${i + 1} points the same way as another ray`);
    rays.push({ dir: o.dir, name: o.name, arrow: o.arrow });
  });
  return rays.length === list.length ? rays : null;
}
function angRead(d) {
  const out = [];
  const odd = Object.keys(d).filter(k => !ANG_KEYS.includes(k));
  if (odd.length) return { problems: [`angles does not take "${odd[0]}" (it takes ${ANG_KEYS.slice(2).join(', ')})`] };
  const c = gmCommon(d, out, { bools: ['arrows'] });
  const rays = angRays(d.rays, out, '');
  if (d.vertex !== undefined && mathProblem(d.vertex, 'the vertex\'s name')) out.push(mathProblem(d.vertex, 'the vertex\'s name'));
  if (!rays) return { problems: out };
  let drawn = rays.map(r => r.dir);
  if (d.drawAs !== undefined) {
    if (!c.notToScale) out.push('"drawAs" only goes with notToScale: true (a figure drawn to scale is drawn from its own directions)');
    else if (!Array.isArray(d.drawAs) || d.drawAs.length !== rays.length || d.drawAs.some(v => !isNum(v, 0, 360) || v >= 360)) out.push(`"drawAs" must list ${rays.length} directions to draw instead, one for each ray`);
    else {
      drawn = d.drawAs.slice();
      const order = l => l.map((v, i) => [angAround(v - l[0]), i]).sort((a, b) => a[0] - b[0]).map(x => x[1]).join();
      if (order(drawn) !== order(rays.map(r => r.dir))) out.push('"drawAs" must keep the rays in the same order round the vertex');
      if (new Set(drawn.map(v => Math.round(v * 1e6))).size !== drawn.length) out.push('"drawAs": two rays point the same way');
    }
  }
  const nm = i => (rays[i].name !== undefined ? mathText(rays[i].name) : `ray ${i + 1}`);
  const vname = d.vertex !== undefined ? mathText(d.vertex) : '';
  const list = d.angles === undefined ? [] : d.angles;
  const angles = [];
  if (!Array.isArray(list)) out.push('"angles" must be a list, like [{ "from": 0, "to": 1, "label": true }]');
  else list.forEach((a, k) => {
    const at = `angle ${k + 1}`;
    if (!a || typeof a !== 'object' || Array.isArray(a)) { out.push(`${at} must be { "from": a ray's number, "to": a ray's number, "label" }`); return; }
    const oddA = Object.keys(a).filter(x => !['from', 'to', 'label', 'arcs'].includes(x));
    if (oddA.length) { out.push(`${at} does not take "${oddA[0]}" (it takes from, to, label, arcs)`); return; }
    if (![a.from, a.to].every(v => Number.isInteger(v) && v >= 0 && v < rays.length) || a.from === a.to) { out.push(`${at}: "from" and "to" must be two different rays, by their place in "rays" (0 for the first)`); return; }
    if (a.arcs !== undefined && !gmCount(a.arcs)) out.push(`${at}: "arcs" must be 0 to 3`);
    const why = gmLabelProblem(a.label, `the label of ${at}`); if (why) out.push(why);
    const measure = angAround(rays[a.to].dir - rays[a.from].dir), shown = angAround(drawn[a.to] - drawn[a.from]);
    const name = rays[a.from].name !== undefined && rays[a.to].name !== undefined && vname ? `∠${nm(a.from)}${vname}${nm(a.to)}` : at;
    angles.push({ ...a, k, name, measure, shown, label: a.label === undefined ? true : a.label, arcs: a.arcs });
  });
  if (out.length) return { problems: out };
  // the truth: what the labels and marks say is what the rays make (and, not to scale, what is drawn too)
  const problems = [];
  for (const a of angles) {
    const cl = a.label === true || a.label === false ? null : gmClaim(a.label, '');
    if (cl !== null && !gmAgrees(cl, a.measure, true)) problems.push(`${a.name} is labeled ${mathText(a.label)} but it is ${r2(a.measure)}°: a label that states a number must state the true one (to draw other directions, add notToScale: true and drawAs)`);
    if (c.notToScale && (Math.abs(a.measure - 90) < 1e-6) !== (Math.abs(a.shown - 90) < 1e-6)) problems.push(`${a.name} is ${Math.abs(a.measure - 90) < 1e-6 ? '' : 'not '}a right angle, so "drawAs" must draw it ${Math.abs(a.measure - 90) < 1e-6 ? 'as one' : 'as one that is not'} (a right angle's square must not lie)`);
  }
  problems.push(...gmMarkClaims(angles.map(a => ({ ...a, count: a.arcs })), a => a.measure, a => a.name, 'arcs claim equal angles', true));
  if (c.notToScale) problems.push(...gmMarkClaims(angles.map(a => ({ ...a, count: a.arcs })), a => a.shown, a => a.name, 'arcs claim equal angles', true, ' as drawn (drawAs)'));
  if (problems.length) return { problems };
  return { problems: [], c, rays, drawn, angles, vertex: d.vertex, arrows: d.arrows !== false };
}
const angRelations = (a, b, rays) => {
  const ends = x => [x.from, x.to], rel = [];
  const share = ends(a).filter(r => ends(b).includes(r));
  const sum = a.measure + b.measure, opp = (i, j) => Math.abs(angAround(rays[i].dir - rays[j].dir) - 180) < 1e-6;
  const inside = (x, r) => angAround(rays[r].dir - rays[x.from].dir) < x.measure - 1e-9 && r !== x.from;
  if (share.length === 1 && !inside(a, ends(b).find(r => r !== share[0])) && !inside(b, ends(a).find(r => r !== share[0]))) rel.push('adjacent');
  if (Math.abs(sum - 90) < 1e-6) rel.push('complementary');
  if (Math.abs(sum - 180) < 1e-6) rel.push('supplementary');
  if (rel.includes('adjacent') && rel.includes('supplementary') && opp(...ends(a).concat(ends(b)).filter(r => r !== share[0]))) rel.push('linear pair');
  if (!share.length && ((opp(a.from, b.from) && opp(a.to, b.to)))) rel.push('vertical');
  return rel;
};
export const angles = {
  check(d) { return angRead(d).problems; },
  /** Each listed angle's measure (from the rays' true directions), and how each pair is related: adjacent,
   *  complementary, supplementary, linear pair, vertical. */
  solve(d) {
    const r = angRead(d);
    if (r.problems.length) return null;
    const list = r.angles.map(a => ({ from: a.from, to: a.to, measure: a.measure }));
    const pairs = [];
    for (let i = 0; i < r.angles.length; i++) for (let j = i + 1; j < r.angles.length; j++) { const rel = angRelations(r.angles[i], r.angles[j], r.rays); if (rel.length) pairs.push({ a: i, b: j, relations: rel }); }
    return { rays: r.rays.map(x => x.dir), angles: list, pairs };
  },
  draw(d, o) {
    const r = angRead(d), W = figWords(o.lang), c = r.c, lang = o.lang;
    const hidden = o.hide === true || hides(o, 'angles');
    const segments = r.rays.map((ray, i) => ({ id: `r${i}`, from: [0, 0], to: angDir(r.drawn[i]), startCap: 'none', endCap: r.arrows && ray.arrow !== false ? 'arrow' : 'none' }));
    const points = [];
    if (r.vertex !== undefined) points.push({ id: 'v', at: [0, 0], dot: true, box: gmName(r.vertex, c.scale, lang) });
    r.rays.forEach((ray, i) => { if (ray.name !== undefined) points.push({ id: `pt${i}`, at: angDir(r.drawn[i]).map(v => v * 0.82), dot: true, box: gmName(ray.name, c.scale, lang), dir: angDir(r.drawn[i]) }); });
    const list = r.angles.map(a => {
      const between = r.drawn.filter((v, i) => i !== a.from && i !== a.to && angAround(v - r.drawn[a.from]) < a.shown).length;
      const square = c.rightAngles && Math.abs(a.measure - 90) < 1e-6;
      const shown = gmBox(a.label === true && square ? false : a.label, a.measure, { scale: c.scale, round: c.round, lang, suffix: '°' });
      return { id: `a${a.k}`, at: [0, 0], u1: angDir(r.drawn[a.from]), u2: angDir(r.drawn[a.to]), measure: a.shown, box: hidden ? null : shown, arcs: a.arcs ?? (shown ? 1 : 0), square, inner: between };
    });
    const L = layoutLinesFigure({ segments, angles: list, points, turn: c.turn, maxScale: 240 });
    return gmDraw(L, o, 'angles', o.title || W('angles'), { notToScale: c.notToScale });
  },
};

// ---------------------------------------------------------------- parallel lines and transversals
const PL_MAX_LINES = 4;
const PL_MAX_T = 3;
const PL_POS = ['above-left', 'above-right', 'below-left', 'below-right'];
const PL_KEYS = ['kind', 'hide', 'lines', 'transversals', 'angles', 'numbered', 'points', 'arrows', 'size', 'round', 'turn', 'rightAngles'];
const PL_REACH = 0.9;
const plDir = deg => [Math.cos(deg * ANG_RAD), Math.sin(deg * ANG_RAD)];

function plRead(d) {
  const out = [];
  const odd = Object.keys(d).filter(k => !PL_KEYS.includes(k));
  if (odd.length) return { problems: [`parallelLines does not take "${odd[0]}" (it takes ${PL_KEYS.slice(2).join(', ')})`] };
  const c = gmCommon(d, out, { bools: ['numbered'] });
  // the lines, 1 apart from the top one down
  const raw = d.lines === undefined ? 2 : d.lines;
  let lines = null;
  if (Number.isInteger(raw) && raw >= 1 && raw <= PL_MAX_LINES) lines = Array.from({ length: raw }, (_, j) => ({ name: 'mnpq'[j] }));
  else if (Array.isArray(raw) && raw.length >= 1 && raw.length <= PL_MAX_LINES) lines = raw.map(x => (typeof x === 'string' ? { name: x } : x && typeof x === 'object' && !Array.isArray(x) ? { ...x } : null));
  if (!lines || lines.some(x => !x)) { out.push(`"lines" must be 1 to ${PL_MAX_LINES}, or a list of names ["m", "n"] or of { "name", "tilt", "arrows" }`); return { problems: out }; }
  lines.forEach((l, j) => {
    const o2 = Object.keys(l).filter(k => !['name', 'tilt', 'arrows'].includes(k));
    if (o2.length) out.push(`line ${j + 1} does not take "${o2[0]}" (it takes name, tilt, arrows)`);
    if (l.name !== undefined && mathProblem(l.name, `the name of line ${j + 1}`)) out.push(mathProblem(l.name, `the name of line ${j + 1}`));
    if (l.tilt !== undefined && !(isNum(l.tilt, -30, 30))) out.push(`line ${j + 1}: "tilt" (degrees off parallel) must be from −30 to 30`);
    if (l.arrows !== undefined && !gmCount(l.arrows)) out.push(`line ${j + 1}: "arrows" must be 0 to 3`);
    l.phi = l.tilt || 0;
  });
  const traw = d.transversals === undefined ? [{ angle: 65 }] : d.transversals;
  if (!Array.isArray(traw) || traw.length < 1 || traw.length > PL_MAX_T) { out.push(`"transversals" must list 1 to ${PL_MAX_T} transversals, like [{ "angle": 65 }]`); return { problems: out }; }
  const trans = traw.map((t, i) => {
    const x = isNum(t) ? { angle: t } : t && typeof t === 'object' && !Array.isArray(t) ? { ...t } : null;
    if (!x) { out.push(`transversal ${i + 1} must be { "angle", "at", "name" }`); return null; }
    const o2 = Object.keys(x).filter(k => !['angle', 'at', 'name', 'arrows'].includes(k));
    if (o2.length) out.push(`transversal ${i + 1} does not take "${o2[0]}" (it takes angle, at, name, arrows)`);
    if (!isNum(x.angle, 10, 170)) out.push(`transversal ${i + 1}: "angle" (with the lines: above the top line, right of the transversal) must be from 10 to 170 degrees`);
    if (x.at !== undefined && !isNum(x.at, -6, 6)) out.push(`transversal ${i + 1}: "at" (where it crosses the top line, in gaps between the lines) must be from −6 to 6`);
    if (x.name !== undefined && mathProblem(x.name, `the name of transversal ${i + 1}`)) out.push(mathProblem(x.name, `the name of transversal ${i + 1}`));
    if (x.arrows !== undefined && !gmCount(x.arrows)) out.push(`transversal ${i + 1}: "arrows" must be 0 to 3`);
    x.name = x.name === undefined ? 'tsuv'[i] : x.name;
    x.at = x.at || 0;
    return x;
  });
  if (out.length) return { problems: out };
  // where each transversal crosses each line (figure units: the top line through (0, 0), the next through (0, -1))
  const crossings = [];
  for (const [ti, t] of trans.entries()) for (const [li, l] of lines.entries()) {
    const P = [0, -li], u = plDir(l.phi), Q = [t.at, 0], w = plDir(t.angle), k = u[0] * w[1] - u[1] * w[0];
    const rel = t.angle - l.phi;
    if (rel < 5 || rel > 175) { out.push(`transversal ${ti + 1} would run (almost) along line ${li + 1}: tilt the line less, or change the angle`); continue; }
    const s = ((Q[0] - P[0]) * w[1] - (Q[1] - P[1]) * w[0]) / k, at = [P[0] + u[0] * s, P[1] + u[1] * s];
    if (Math.abs(at[0]) > 8) { out.push(`transversal ${ti + 1} meets line ${li + 1} too far off the page: tilt the line less`); continue; }
    crossings.push({ li, ti, at, rel, measures: { 'above-right': rel, 'above-left': 180 - rel, 'below-left': rel, 'below-right': 180 - rel } });
  }
  if (out.length) return { problems: out };
  const crossingOf = (li, ti) => crossings.find(x => x.li === li && x.ti === ti);
  const lineIx = v => (Number.isInteger(v) && v >= 0 && v < lines.length ? v : lines.findIndex(l => l.name !== undefined && l.name === v));
  const tIx = v => (Number.isInteger(v) && v >= 0 && v < trans.length ? v : trans.findIndex(t => t.name === v));
  // the numbering 1, 2, 3, ... crossing by crossing (each transversal top to bottom), round each as on a page
  const numbered = [];
  for (const [ti] of trans.entries()) for (const [li] of lines.entries()) for (const pos of PL_POS) numbered.push({ li, ti, pos });
  const nameL = li => (lines[li].name !== undefined ? mathText(lines[li].name) : `line ${li + 1}`), nameT = ti => mathText(trans[ti].name);
  const angles = [];
  const list = d.angles === undefined ? [] : d.angles;
  if (!Array.isArray(list)) out.push('"angles" must be a list, like [{ "line": "m", "transversal": "t", "pos": "above-right", "label": true }]');
  else list.forEach((a, k) => {
    const at = `angle ${k + 1}`;
    if (!a || typeof a !== 'object' || Array.isArray(a)) { out.push(`${at} must be { "line", "transversal", "pos", "label" } or { "number", "label" }`); return; }
    const oddA = Object.keys(a).filter(x => !['line', 'transversal', 'pos', 'number', 'label', 'arcs'].includes(x));
    if (oddA.length) { out.push(`${at} does not take "${oddA[0]}" (it takes line, transversal, pos, number, label, arcs)`); return; }
    let li, ti, pos;
    if (a.number !== undefined) {
      if (!(Number.isInteger(a.number) && a.number >= 1 && a.number <= numbered.length)) { out.push(`${at}: "number" must be 1 to ${numbered.length} (the angles counted crossing by crossing)`); return; }
      ({ li, ti, pos } = numbered[a.number - 1]);
    } else {
      li = lineIx(a.line === undefined ? 0 : a.line); ti = tIx(a.transversal === undefined ? 0 : a.transversal); pos = a.pos;
      if (li < 0) { out.push(`${at}: "line" must be a line's name or its place (0 for the top line)`); return; }
      if (ti < 0) { out.push(`${at}: "transversal" must be a transversal's name or its place (0 for the first)`); return; }
      if (!PL_POS.includes(pos)) { out.push(`${at}: "pos" must be one of ${PL_POS.join(', ')} (above or below the line, left or right of the transversal)`); return; }
    }
    if (a.arcs !== undefined && !gmCount(a.arcs)) out.push(`${at}: "arcs" must be 0 to 3`);
    const why = gmLabelProblem(a.label, `the label of ${at}`); if (why) out.push(why);
    const x = crossingOf(li, ti), number = numbered.findIndex(n => n.li === li && n.ti === ti && n.pos === pos) + 1;
    angles.push({ k, li, ti, pos, number, measure: x.measures[pos], label: a.label === undefined ? true : a.label, arcs: a.arcs, name: `the ${pos} angle where ${nameT(ti)} crosses ${nameL(li)}` });
  });
  const points = [];
  for (const [k, p] of (Array.isArray(d.points) ? d.points : []).entries()) {
    const li = lineIx(p && p.line === undefined ? 0 : p && p.line), ti = tIx(p && p.transversal === undefined ? 0 : p && p.transversal);
    if (!p || li < 0 || ti < 0 || p.name === undefined) { out.push(`point ${k + 1} must be { "line", "transversal", "name" } (a name where they cross)`); continue; }
    if (mathProblem(p.name, `the name of point ${k + 1}`)) out.push(mathProblem(p.name, `the name of point ${k + 1}`));
    points.push({ li, ti, name: p.name });
  }
  if (d.points !== undefined && !Array.isArray(d.points)) out.push('"points" must be a list, like [{ "line": "m", "transversal": "t", "name": "A" }]');
  if (d.arrows !== undefined && typeof d.arrows !== 'boolean') out.push('"arrows" must be true or false (parallel arrows on the parallel lines)');
  if (out.length) return { problems: out };

  // arrows: claimed only on lines that really are parallel, and in pairs or more
  const straight = lines.filter(l => !l.phi).length;
  const arrowsOf = lines.map(l => (l.arrows !== undefined ? l.arrows : d.arrows === false || l.phi || straight < 2 ? 0 : 1));
  const tArrows = trans.map(t => t.arrows || 0);
  const all = [...lines.map((l, j) => ({ dir: l.phi, count: arrowsOf[j], name: nameL(j) })), ...trans.map((t, i) => ({ dir: t.angle, count: tArrows[i], name: nameT(i) }))];
  const problems = [];
  const groups = {};
  for (const x of all) if (x.count) (groups[x.count] = groups[x.count] || []).push(x);
  for (const g of Object.values(groups)) {
    if (g.length < 2) problems.push(`parallel arrows on ${g[0].name} claim it is parallel to another line with the same arrows, and there is none`);
    for (const x of g.slice(1)) if (Math.abs(x.dir - g[0].dir) > 1e-9) problems.push(`parallel arrows claim ${g[0].name} and ${x.name} are parallel, but they are not (${r2(Math.abs(x.dir - g[0].dir))}° apart)`);
  }
  for (const a of angles) {
    const cl = a.label === true || a.label === false ? null : gmClaim(a.label, '');
    if (cl !== null && !gmAgrees(cl, a.measure, true)) problems.push(`${a.name} is labeled ${mathText(a.label)} but it is ${r2(a.measure)}°: a label that states a number must state the true one`);
  }
  problems.push(...gmMarkClaims(angles.map(a => ({ ...a, count: a.arcs })), a => a.measure, a => a.name, 'arcs claim equal angles', true));
  if (problems.length) return { problems };
  return { problems: [], c, lines, trans, crossings, angles, numbered, points, arrowsOf, tArrows, numberedOn: d.numbered === true };
}
/** How two angles at crossings of the same transversal are related, by where they sit. */
function plRelation(a, b) {
  const [va, ha] = a.pos.split('-'), [vb, hb] = b.pos.split('-');
  if (a.ti !== b.ti) return null;
  if (a.li === b.li) return va !== vb && ha !== hb ? 'vertical' : va !== vb || ha !== hb ? 'linear pair' : 'same';
  const [up, down] = a.li < b.li ? [a, b] : [b, a];
  const inner = x => (x === up ? x.pos.startsWith('below') : x.pos.startsWith('above'));
  if (va === vb && ha === hb) return 'corresponding';
  if (inner(a) && inner(b)) return ha !== hb ? 'alternate interior' : 'same-side interior';
  if (!inner(a) && !inner(b)) return ha !== hb ? 'alternate exterior' : 'same-side exterior';
  return null;
}
export const parallelLines = {
  check(d) { return plRead(d).problems; },
  /** The measures: each crossing's four angles, every angle by its number, the listed angles, how each pair of them is
   *  related (corresponding, alternate interior, ...), and whether the lines are parallel. */
  solve(d) {
    const r = plRead(d);
    if (r.problems.length) return null;
    const crossings = r.crossings.map(x => ({ line: x.li, transversal: x.ti, angles: { ...x.measures } }));
    const numbered = Object.fromEntries(r.numbered.map((n, i) => [i + 1, r.crossings.find(x => x.li === n.li && x.ti === n.ti).measures[n.pos]]));
    const pairs = [];
    for (let i = 0; i < r.angles.length; i++) for (let j = i + 1; j < r.angles.length; j++) { const rel = plRelation(r.angles[i], r.angles[j]); if (rel && rel !== 'same') pairs.push({ a: i, b: j, relation: rel, equal: Math.abs(r.angles[i].measure - r.angles[j].measure) < 1e-9, sum: r.angles[i].measure + r.angles[j].measure }); }
    return { parallel: r.lines.every(l => !l.phi), crossings, numbered, angles: r.angles.map(a => ({ line: a.li, transversal: a.ti, pos: a.pos, number: a.number, measure: a.measure })), pairs };
  },
  draw(d, o) {
    const r = plRead(d), W = figWords(o.lang), c = r.c, lang = o.lang, P = r.lines.length;
    const hidden = o.hide === true || hides(o, 'angles');
    const margin = P > 1 ? 0.9 : 1.3, yLo = -(P - 1) - margin, yHi = margin;
    const xs = r.crossings.map(x => x.at[0]);
    let [xLo, xHi] = [Math.min(...xs) - PL_REACH, Math.max(...xs) + PL_REACH];
    if (xHi - xLo < 3) [xLo, xHi] = [(xLo + xHi) / 2 - 1.5, (xLo + xHi) / 2 + 1.5];
    const segments = [];
    r.lines.forEach((l, j) => {
      const u = plDir(l.phi), P0 = [0, -j], from = [xLo, P0[1] + (xLo / u[0]) * u[1]], to = [xHi, P0[1] + (xHi / u[0]) * u[1]];
      const first = r.crossings.filter(x => x.li === j).map(x => x.at[0]).sort((a, b) => a - b)[0];
      const ax = (xLo + (first ?? xHi)) / 2;
      segments.push({ id: `p${j}`, from, to, startCap: 'arrow', endCap: 'arrow', name: gmName(l.name, c.scale, lang), arrows: r.arrowsOf[j], arrowAt: [ax, P0[1] + (ax / u[0]) * u[1]] });
    });
    r.trans.forEach((t, i) => {
      const w = plDir(t.angle), from = [t.at + ((yLo - 0) / w[1]) * w[0], yLo], to = [t.at + (yHi / w[1]) * w[0], yHi];
      const first = r.crossings.filter(x => x.ti === i).map(x => x.at[1]).sort((a, b) => a - b)[0];
      const ay = (yLo + (first ?? yHi)) / 2;
      segments.push({ id: `t${i}`, from, to, startCap: 'arrow', endCap: 'arrow', name: gmName(t.name, c.scale, lang), arrows: r.tArrows[i], arrowAt: [t.at + (ay / w[1]) * w[0], ay] });
    });
    const rays = (x, pos) => {
      const u = plDir(r.lines[x.li].phi), w = plDir(r.trans[x.ti].angle), m = v => [-v[0], -v[1]];
      return { 'above-right': [u, w], 'above-left': [w, m(u)], 'below-left': [m(u), m(w)], 'below-right': [m(w), u] }[pos];
    };
    const list = [];
    for (const a of r.angles) {
      const x = r.crossings.find(y => y.li === a.li && y.ti === a.ti), [u1, u2] = rays(x, a.pos);
      const square = c.rightAngles && Math.abs(a.measure - 90) < 1e-6;
      const shown = gmBox(a.label === true && square ? false : a.label, a.measure, { scale: c.scale, round: c.round, lang, suffix: '°' });
      list.push({ id: `a${a.k}`, at: x.at, u1, u2, measure: a.measure, box: hidden ? null : shown, arcs: a.arcs ?? (shown ? 1 : 0), square });
    }
    if (r.numberedOn) r.numbered.forEach((n, i) => {
      if (r.angles.some(a => a.number === i + 1)) return;
      const x = r.crossings.find(y => y.li === n.li && y.ti === n.ti), [u1, u2] = rays(x, n.pos);
      list.push({ id: `n${i + 1}`, at: x.at, u1, u2, measure: x.measures[n.pos], box: mathBox(i + 1, 18 * c.scale, { lang }), arcs: 0, square: false });
    });
    const points = r.points.map((p, k) => ({ id: `pt${k}`, at: r.crossings.find(y => y.li === p.li && y.ti === p.ti).at, dot: true, box: gmName(p.name, c.scale, lang) }));
    const L = layoutLinesFigure({ segments, angles: list, points, turn: c.turn });
    return gmDraw(L, o, 'parallelLines', o.title || W('parallelLines'));
  },
};

export const LINE_KINDS = { angles, parallelLines };
