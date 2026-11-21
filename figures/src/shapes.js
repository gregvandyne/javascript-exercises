// Oomba Figures: measured shapes. A triangle, a rectangle (or square), a parallelogram (or rhombus), a trapezoid (any,
// isosceles or right), a kite and a regular polygon, each drawn to scale from its measures: the corners come from the
// numbers (ported/polygons.js), the marks and labels are laid out around them (ported/shapes.js), and the labels are
// typeset as math (mathtext.js). Everything the figure says is true of the measures: a mark claims an equal side, an
// equal angle or a parallel side only where there is one, a label that states a number states the right one, and a right
// angle carries its square. A teacher who wants a figure "not drawn to scale" says so (notToScale: true): the note is
// printed on the figure, and drawAs gives the proportions to draw instead, while the labels and marks stay true of the
// measures (docs/figures-api.md "Shapes").
import { node, frame, palette, isNum, text, hides, r2, label } from './svg.js';
import { figWords } from './words.js';
import { mathBox, mathNode, mathText, mathProblem, mathValue } from './mathtext.js';
import { layoutShape, sidesOf } from './ported/shapes.js';
import { solveTriangle, triCorners, TRI_OPPOSITE, TRI_ANGLE_SLACK, TRI_SIDE_SLACK, QUAD_CORNERS, QUAD_SIDES, QUAD_KINDS, quadCorners, quadMeasure, quadOnSide, rpMeasures, rpCorners } from './ported/polygons.js';

const SHP_SIZES = { small: 0.8, medium: 1, large: 1.4 };
const SHP_DASH = { dashed: '7 5', solid: null, dotted: '0.01 5' };
const SHP_RIGHT = 1e-6;                          // how close to 90° counts as a right angle
const SHP_TRI = ['A', 'B', 'C'];
const SHP_TRI_SIDES = ['AB', 'BC', 'CA'];
const SHP_MEASURES = ['A', 'B', 'C', 'D', 'AB', 'BC', 'CD', 'DA', 'CA', 'h', 'side', 'radius', 'apothem'];
const SHP_LEN_HELP = 'a length: a number above 0, a fraction [n, d], or a root like { "sqrt": 5, "times": 3 } for 3√5';
const SHP_NOTE_H = 30;                           // room for "Not drawn to scale" under the figure

/** A length from the data: a number, a fraction [n, d], or { sqrt, times } -> { v, label (how it is written) } or null. */
function shpLen(x) {
  if (isNum(x) && x > 0 && x <= 1e6) return { v: x, label: x };
  if (Array.isArray(x) && x.length === 2 && Number.isInteger(x[0]) && Number.isInteger(x[1]) && x[0] > 0 && x[1] > 0 && x[0] <= 1e6 && x[1] <= 1e4) return { v: x[0] / x[1], label: { frac: [x[0], x[1]] } };
  if (x && typeof x === 'object' && !Array.isArray(x) && 'sqrt' in x && Object.keys(x).every(k => k === 'sqrt' || k === 'times') && !mathProblem(x)) {
    const v = mathValue(x);
    if (v !== null && v > 0 && v <= 1e6) return { v, label: x };
  }
  return null;
}
const shpAngle = x => (isNum(x) && x > 0 && x < 180 ? { v: x, label: x } : null);
const shpHas = (d, k) => d[k] !== undefined && d[k] !== null;
/** A label as the data gives it, with a trailing unit or degree sign set aside, -> the number it states, or null. */
function shpClaim(l, unit) {
  if (typeof l === 'string') {
    const s = l.trim().replace(/°$/, '').trim();
    return mathValue(unit && s.endsWith(unit) ? s.slice(0, -unit.length).trim() : s);
  }
  return mathValue(l);
}

// ---------------------------------------------------------------- each kind: its measures -> its true shape
// measure(src, out, at, names) -> { ids, corners (y up), angles, sides, sized, typed: { measure: label }, extras: { part:
// value }, ... } or null with the problems in out. flags: the data keys that pick a kind's form (kept for drawAs).

const triangleDef = {
  word: () => 'triangle', flags: ['other'], measures: [...SHP_TRI, ...SHP_TRI_SIDES],
  measure(src, out, at, names) {
    const given = {}, typed = {}, n0 = out.length;
    for (const v of SHP_TRI) if (shpHas(src, v)) { const a = shpAngle(src[v]); if (!a) out.push(`${at}${v} must be an angle in degrees, more than 0 and less than 180`); else { given[v] = a.v; typed[v] = a.label; } }
    for (const s of SHP_TRI_SIDES) if (shpHas(src, s)) { const l = shpLen(src[s]); if (!l) out.push(`${at}${s} must be ${SHP_LEN_HELP}`); else { given[s] = l.v; typed[s] = l.label; } }
    for (const k of ['D', 'CD', 'DA', 'h', 'side', 'radius', 'apothem']) if (shpHas(src, k)) out.push(`${at}a triangle's measures are A, B, C (angles) and AB, BC, CA (sides): leave out "${k}"`);
    if (out.length > n0) return null;
    const r = solveTriangle(given, { other: src.other === true, names });
    if (r.problem) { out.push(`${at}${r.problem}`); return null; }
    const base = src.base === undefined ? 'AB' : src.base;
    const corners = triCorners(r, base), area = 0.5 * r.sides.AB * r.sides.CA * Math.sin((r.angles.A * Math.PI) / 180);
    const extras = Object.fromEntries(SHP_TRI.map(v => [`h${v}`, (2 * area) / r.sides[TRI_OPPOSITE[v]]]));
    return { ids: SHP_TRI, corners, angles: r.angles, sides: r.sides, sized: r.sized, typed, extras, ambiguous: r.ambiguous, area };
  },
  parts: { labels: [...SHP_TRI, ...SHP_TRI_SIDES, 'hA', 'hB', 'hC'], ticks: SHP_TRI_SIDES, arcs: SHP_TRI, arrows: [], heights: SHP_TRI, diagonals: [], bases: SHP_TRI_SIDES },
  heightOnto: v => TRI_OPPOSITE[v].split(''),
  defaults: () => ({}),
  solve(m) {
    const right = SHP_TRI.find(v => Math.abs(m.angles[v] - 90) < SHP_RIGHT) || null, maxA = Math.max(...SHP_TRI.map(v => m.angles[v]));
    const eq = (p, q) => Math.abs(m.sides[p] - m.sides[q]) < 1e-9 * Math.max(1, m.sides[p]);
    const same = [eq('AB', 'BC'), eq('BC', 'CA'), eq('CA', 'AB')].filter(Boolean).length;
    return {
      angles: m.angles, sides: m.sides, sized: m.sized, ambiguous: m.ambiguous, right,
      byAngles: right ? 'right' : maxA > 90 + SHP_RIGHT ? 'obtuse' : 'acute', bySides: same === 3 ? 'equilateral' : same ? 'isosceles' : 'scalene',
      perimeter: m.sized ? m.sides.AB + m.sides.BC + m.sides.CA : null, area: m.sized ? m.area : null,
      heights: m.sized ? { A: m.extras.hA, B: m.extras.hB, C: m.extras.hC } : null,
    };
  },
};

/** The quadrilaterals share one reader: which form (QUAD_KINDS) comes from the kind and its flags. */
function quadDef(kind, formOf, o) {
  return {
    word: src => ({ square: 'square', rhombus: 'rhombus' }[formOf(src)] || kind), flags: o.flags, measures: ['A', 'B', 'C', 'D', 'AB', 'BC', 'CD', 'DA', 'h'],
    measure(src, out, at, names) {
      const form = formOf(src);
      if (!form) { out.push(`${at}${o.formHelp}`); return null; }
      const K = QUAD_KINDS[form], g = {}, typed = {}, n0 = out.length;
      const nameOf = m => (m === 'h' ? 'the height h' : m.length === 1 ? `∠${names[m] || m}` : `${names[m[0]] || m[0]}${names[m[1]] || m[1]}`);
      for (const m of K.givens) {
        if (!shpHas(src, m)) { out.push(`${at}${o.what(form)} needs ${K.givens.map(x => (x.length === 1 && x !== 'h' ? `${x} (an angle)` : x)).join(', ')}: give ${m}`); continue; }
        const v = m.length === 1 && m !== 'h' ? shpAngle(src[m]) : shpLen(src[m]);
        if (!v) out.push(`${at}${m} must be ${m.length === 1 && m !== 'h' ? 'an angle in degrees, more than 0 and less than 180' : SHP_LEN_HELP}`);
        else { g[m] = v.v; typed[m] = v.label; }
      }
      for (const m of SHP_MEASURES) if (!K.givens.includes(m) && shpHas(src, m)) out.push(`${at}${o.what(form)} is drawn from ${K.givens.join(', ')}; leave out "${m}" (it follows from them)`);
      if (out.length > n0) return null;
      const r = quadCorners(form, g, nameOf);
      if (r.problem) { out.push(`${at}${r.problem}`); return null; }
      const corners = quadOnSide(r.corners, src.base), mm = quadMeasure(corners);
      for (const [s, same] of Object.entries(K.equal)) typed[s] = typed[same];
      const dist = (p, [a, b]) => { const A = corners[a], B = corners[b], dx = B[0] - A[0], dy = B[1] - A[1]; return Math.abs(dx * (p[1] - A[1]) - dy * (p[0] - A[0])) / Math.hypot(dx, dy); };
      const diag = ([a, b]) => Math.hypot(corners[b][0] - corners[a][0], corners[b][1] - corners[a][1]);
      const extras = { hD: dist(corners.D, ['A', 'B']), hC: dist(corners.C, ['A', 'B']), AC: diag(['A', 'C']), BD: diag(['B', 'D']) };
      if ('h' in typed) { typed.hD = typed.h; typed.hC = typed.h; }
      const area = 0.5 * Math.abs(QUAD_CORNERS.reduce((t, v, i) => { const p = corners[v], q = corners[QUAD_CORNERS[(i + 1) % 4]]; return t + p[0] * q[1] - q[0] * p[1]; }, 0));
      return { ids: QUAD_CORNERS, corners, angles: mm.angles, sides: mm.sides, sized: true, typed, extras, form, area, givens: K.givens };
    },
    parts: { labels: [...QUAD_CORNERS, ...QUAD_SIDES, 'AC', 'BD', ...(o.heights ? ['hD', 'hC'] : [])], ticks: QUAD_SIDES, arcs: QUAD_CORNERS, arrows: QUAD_SIDES, heights: o.heights ? ['D', 'C'] : [], diagonals: ['AC', 'BD'], bases: QUAD_SIDES },
    heightOnto: () => ['A', 'B'],
    defaults: m => o.defaults(m),
    solve(m) {
      const s = m.sides;
      return {
        form: m.form, angles: m.angles, sides: s, perimeter: s.AB + s.BC + s.CD + s.DA, area: m.area,
        height: o.heights ? m.extras.hD : null, diagonals: { AC: m.extras.AC, BD: m.extras.BD },
        right: QUAD_CORNERS.filter(v => Math.abs(m.angles[v] - 90) < SHP_RIGHT),
      };
    },
  };
}
const rectangleDef = quadDef('rectangle', s => (s.square === true ? 'square' : 'rectangle'), {
  flags: ['square'], heights: false, formHelp: '', what: f => `a ${f}`, defaults: () => ({}),
});
const parallelogramDef = quadDef('parallelogram', s => (s.rhombus === true ? 'rhombus' : 'parallelogram'), {
  flags: ['rhombus'], heights: true, formHelp: '', what: f => `a ${f}`,
  defaults: () => ({ arrows: { AB: 1, CD: 1, BC: 2, DA: 2 } }),
});
const trapezoidDef = quadDef('trapezoid', s => (s.type === undefined ? 'trapezoid' : s.type === 'isosceles' || s.type === 'right' ? s.type : null), {
  flags: ['type'], heights: true, formHelp: '"type" must be "isosceles" or "right" (or leave it out for any trapezoid)',
  what: f => (f === 'trapezoid' ? 'a trapezoid' : `${f === 'right' ? 'a right' : 'an isosceles'} trapezoid`),
  defaults: m => ({ arrows: { AB: 1, CD: 1 }, ...('h' in m.typed ? { heights: [{ from: 'D' }], labels: { hD: true } } : {}) }),
});
const kiteDef = quadDef('kite', () => 'kite', {
  flags: [], heights: false, formHelp: '', what: () => 'a kite', defaults: () => ({ ticks: { AB: 1, BC: 1, CD: 2, DA: 2 } }),
});

const RP_MAX = 20;
const regularPolygonDef = {
  word: () => 'regularPolygon', flags: ['n'], measures: ['side', 'radius', 'apothem'],
  measure(src, out, at) {
    const n0 = out.length;
    if (!(Number.isInteger(src.n) && src.n >= 3 && src.n <= RP_MAX)) out.push(`${at}"n" (the number of sides) must be a whole number from 3 to ${RP_MAX}`);
    const by = ['side', 'radius', 'apothem'].filter(k => shpHas(src, k));
    if (by.length !== 1) out.push(`${at}give exactly one of "side", "radius" or "apothem" (the others follow from it)`);
    for (const k of ['A', 'B', 'C', 'D', 'AB', 'BC', 'CD', 'DA', 'CA', 'h']) if (shpHas(src, k)) out.push(`${at}a regular polygon is drawn from "n" and one of side, radius or apothem: leave out "${k}"`);
    if (out.length > n0) return null;
    const l = shpLen(src[by[0]]);
    if (!l) { out.push(`${at}${by[0]} must be ${SHP_LEN_HELP}`); return null; }
    const p = rpMeasures(src.n, by[0], l.v), cs = rpCorners(src.n, p.radius), ids = cs.map(c => c.id);
    return {
      ids, corners: Object.fromEntries(cs.map(c => [c.id, c.at])), angles: Object.fromEntries(ids.map(v => [v, p.interior])),
      sides: Object.fromEntries(sidesOf(ids).map(([s]) => [s, p.side])), sized: true, typed: { [by[0]]: l.label, ...(by[0] === 'side' ? { AB: l.label } : {}) },
      extras: { apothem: p.apothem, radius: p.radius }, poly: p, by: by[0],
    };
  },
  parts: { labels: ['side', 'angle', 'apothem', 'radius'], ticks: [], arcs: [], arrows: [], heights: [], diagonals: [], bases: [] },
  defaults: () => ({}),
  solve(m) { const p = m.poly; return { n: p.n, side: p.side, radius: p.radius, apothem: p.apothem, interior: p.interior, central: p.central, exterior: 360 / p.n, perimeter: p.n * p.side, area: (p.n * p.side * p.apothem) / 2 }; },
};

const SHAPE_DEFS = { triangle: triangleDef, rectangle: rectangleDef, parallelogram: parallelogramDef, trapezoid: trapezoidDef, kite: kiteDef, regularPolygon: regularPolygonDef };

// ---------------------------------------------------------------- reading a shape's data
function shpMarks(d, key, parts, out, def) {
  const v = d[key];
  if (v === undefined) return { ...(def || {}) };
  if (!v || typeof v !== 'object' || Array.isArray(v)) { out.push(`"${key}" must be { part: 1 to 3 }, like { "${parts[0] || 'AB'}": 1 }`); return {}; }
  const r = {};
  for (const [p, c] of Object.entries(v)) {
    if (!parts.includes(p)) out.push(`"${key}": "${p}" is not one of ${parts.join(', ') || '(none here)'}`);
    else if (!(Number.isInteger(c) && c >= 0 && c <= 3)) out.push(`"${key}": ${p} must be 0 to 3`);
    else if (c) r[p] = c;
  }
  return r;
}
/** Read the data -> { problems } or the model the drawing and solve() use. */
const SHP_KEYS = ['kind', 'hide', 'names', 'labels', 'unit', 'round', 'size', 'rotate', 'rightAngles', 'notToScale', 'drawAs'];
const SHP_OWN_KEYS = {
  triangle: ['A', 'B', 'C', 'AB', 'BC', 'CA', 'ticks', 'arcs', 'arrows', 'heights', 'base', 'flip'],
  quad: ['A', 'B', 'C', 'D', 'AB', 'BC', 'CD', 'DA', 'h', 'ticks', 'arcs', 'arrows', 'heights', 'diagonals', 'cross', 'base', 'flip'],
  regularPolygon: ['n', 'side', 'radius', 'apothem', 'ticks', 'arcs', 'center', 'centerName', 'lines'],
};
function shpRead(kind, d) {
  const K = SHAPE_DEFS[kind], out = [], reg = kind === 'regularPolygon';
  const keys = [...new Set([...SHP_KEYS, ...(SHP_OWN_KEYS[kind] || SHP_OWN_KEYS.quad), ...K.flags])];
  const odd = Object.keys(d).filter(k => !keys.includes(k));
  if (odd.length) return { problems: [`${kind} does not take "${odd[0]}" (it takes ${keys.filter(k => k !== 'kind' && k !== 'hide').join(', ')})`] };
  // names first: messages use them
  let names = {};
  const ids0 = reg ? null : kind === 'triangle' ? SHP_TRI : QUAD_CORNERS;
  if (reg) {
    if (d.names !== undefined && typeof d.names !== 'boolean') out.push('"names" for a regular polygon is true (letters A, B, C... round it) or false');
  } else if (d.names === false) names = Object.fromEntries(ids0.map(v => [v, '']));
  else if (Array.isArray(d.names)) {
    if (d.names.length !== ids0.length) out.push(`"names" must list ${ids0.length} names, one for each corner (${ids0.join(', ')})`);
    else ids0.forEach((v, i) => { names[v] = d.names[i]; });
  } else if (d.names && typeof d.names === 'object') {
    for (const [v, nm] of Object.entries(d.names)) { if (!ids0.includes(v)) out.push(`"names": "${v}" is not a corner (${ids0.join(', ')})`); else names[v] = nm; }
  } else if (d.names !== undefined) out.push(`"names" must be a list of ${ids0.length} names, { "A": "P", ... }, or false`);
  for (const [v, nm] of Object.entries(names)) { const why = nm === '' ? null : mathProblem(nm, `the name of ${v}`); if (why) out.push(why); }
  const plain = Object.fromEntries(Object.entries(names).map(([v, nm]) => [v, mathText(nm) || v]));

  const m = K.measure(d, out, '', plain);
  if (!m) return { problems: out };
  const unit = d.unit === undefined ? '' : text(d.unit, 12);
  if (d.unit !== undefined && (typeof d.unit !== 'string' || d.unit.length > 12)) out.push('"unit" must be short text, like "cm" or "in"');
  const round = d.round === undefined ? 1 : d.round;
  if (![0, 1, 2].includes(round)) out.push('"round" must be 0, 1 or 2 (decimal places for the measures it works out)');
  if (d.size !== undefined && !SHP_SIZES[d.size]) out.push(`"size" must be one of ${Object.keys(SHP_SIZES).join(', ')}`);
  if (d.base !== undefined && !K.parts.bases.includes(d.base)) out.push(K.parts.bases.length ? `"base" (the side along the bottom) must be one of ${K.parts.bases.join(', ')}` : '"base" does not apply here: use "rotate"');
  if (d.rotate !== undefined && !isNum(d.rotate, -180, 180)) out.push('"rotate" must be degrees from −180 to 180');
  for (const k of ['flip', 'rightAngles', 'notToScale', 'other', 'square', 'rhombus']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
  if (reg && d.flip !== undefined) out.push('"flip" does not apply to a regular polygon (it looks the same flipped)');

  // the proportions drawn: the measures, or (not to scale) the drawAs measures of the same kind
  let drawn = m;
  if (d.drawAs !== undefined) {
    if (d.notToScale !== true) out.push('"drawAs" only goes with notToScale: true (a figure drawn to scale is drawn from its own measures)');
    else if (reg) out.push('a regular polygon has one shape for each n, so it needs no "drawAs" (notToScale: true still prints the note)');
    else if (!d.drawAs || typeof d.drawAs !== 'object' || Array.isArray(d.drawAs)) out.push('"drawAs" must be the measures to draw, like { "AB": 8, "BC": 4 }');
    else {
      const src = { ...Object.fromEntries(K.flags.filter(f => d[f] !== undefined).map(f => [f, d[f]])), base: d.base };
      for (const [k, v] of Object.entries(d.drawAs)) { if (K.measures.includes(k)) src[k] = v; else out.push(`"drawAs": "${k}" is not a measure (${K.measures.join(', ')})`); }
      drawn = K.measure(src, out, '"drawAs": ', plain) || m;
    }
  }

  // labels, marks and lines
  const def = K.defaults(m), P = K.parts;
  const labels = {};
  if (d.labels !== undefined && (!d.labels || typeof d.labels !== 'object' || Array.isArray(d.labels))) out.push(`"labels" must be { part: true, false or a label }, like { "${P.labels[0]}": "x" }`);
  const given = d.labels && typeof d.labels === 'object' && !Array.isArray(d.labels) ? d.labels : {};
  for (const [p, l] of Object.entries(given)) {
    if (!P.labels.includes(p)) { out.push(`"labels": "${p}" is not a part here (${P.labels.join(', ')})`); continue; }
    if (l === true || l === false) continue;
    const why = mathProblem(l, `the label of ${p}`);
    if (why) out.push(why);
  }
  const ticks = reg ? {} : shpMarks(d, 'ticks', P.ticks, out, def.ticks);
  const arcs = reg ? {} : shpMarks(d, 'arcs', P.arcs, out, def.arcs);
  const arrows = reg ? {} : P.arrows.length || d.arrows === undefined ? shpMarks(d, 'arrows', P.arrows, out, def.arrows) : (out.push('"arrows" (parallel marks) do not apply here: no two sides are parallel'), {});
  const style = (s, at) => { if (s === undefined) return 'dashed'; if (!(s in SHP_DASH)) { out.push(`${at}: "style" must be dashed, solid or dotted`); return 'dashed'; } return s; };
  let heights = [];
  const hList = d.heights === undefined ? def.heights || [] : d.heights;
  if (!Array.isArray(hList)) out.push('"heights" must be a list of corners, like ["C"] or [{ "from": "C", "foot": "H" }]');
  else for (const h of hList) {
    const from = typeof h === 'string' ? h : h && h.from;
    if (!P.heights.includes(from)) { out.push(P.heights.length ? `"heights": a height runs from ${P.heights.join(' or ')}` : '"heights" do not apply here'); continue; }
    if (h.foot !== undefined && mathProblem(h.foot, `the foot of the height from ${from}`)) out.push(mathProblem(h.foot, `the foot of the height from ${from}`));
    heights.push({ from, foot: typeof h === 'object' && h.foot !== undefined ? h.foot : '', style: style(typeof h === 'object' ? h.style : undefined, `the height from ${from}`) });
  }
  heights = heights.filter((h, i) => heights.findIndex(x => x.from === h.from) === i);
  let diagonals = [];
  if (d.diagonals !== undefined) {
    if (!Array.isArray(d.diagonals)) out.push('"diagonals" must be a list, like ["AC", "BD"]');
    else for (const g of d.diagonals) {
      const ends = typeof g === 'string' ? g : g && g.ends;
      if (!P.diagonals.includes(ends)) { out.push(P.diagonals.length ? `"diagonals": a diagonal is ${P.diagonals.join(' or ')}` : '"diagonals" do not apply here'); continue; }
      diagonals.push({ ends, style: typeof g === 'object' && g.style !== undefined ? style(g.style, `diagonal ${ends}`) : 'solid' });
    }
    diagonals = diagonals.filter((g, i) => diagonals.findIndex(x => x.ends === g.ends) === i);
  }
  if (d.cross !== undefined) { if (diagonals.length !== 2) out.push('"cross" names where the diagonals cross: draw both diagonals'); else if (mathProblem(d.cross, 'the name at the crossing')) out.push(mathProblem(d.cross, 'the name at the crossing')); }
  // a regular polygon's own parts
  let rp = null;
  if (reg) {
    for (const k of ['ticks', 'arcs']) if (d[k] !== undefined && !(Number.isInteger(d[k]) && d[k] >= 0 && d[k] <= 3)) out.push(`"${k}" for a regular polygon is 0 to 3 (on every ${k === 'ticks' ? 'side' : 'angle'})`);
    if (d.center !== undefined && typeof d.center !== 'boolean') out.push('"center" must be true or false (the dot at the center)');
    const lines = d.lines === undefined ? (m.by === 'side' ? [] : [m.by]) : d.lines;
    if (!Array.isArray(lines) || lines.some(x => !['apothem', 'radius', 'radii'].includes(x))) out.push('"lines" must be a list of "apothem", "radius" (to B) and "radii" (to every corner)');
    if (d.centerName !== undefined && mathProblem(d.centerName, 'the center\'s name')) out.push(mathProblem(d.centerName, 'the center\'s name'));
    const L = Array.isArray(lines) ? lines : [];
    rp = { ticks: d.ticks || 0, arcs: d.arcs || 0, center: d.center !== false, apothem: L.includes('apothem'), radius: L.includes('radius'), radii: L.includes('radii') };
  }
  if (out.length) return { problems: out };

  // what each part says: given measures show their measure, worked-out ones nothing, unless the data says otherwise
  const rightAngles = d.rightAngles !== false;
  const truthRight = v => Math.abs(m.angles[v] - 90) < SHP_RIGHT;
  const want = {};
  for (const k of m.givens || Object.keys(m.typed)) if (P.labels.includes(k)) want[k] = true;
  if (reg) { if (m.by === 'side') want.side = true; if (m.by !== 'side' && rp[m.by]) want[m.by] = true; }
  for (const v of m.ids) if (want[v] && truthRight(v) && rightAngles) want[v] = false;   // a right angle's square says 90°
  Object.assign(want, def.labels || {}, given);

  // the truth checks: every mark and every stated number agrees with the measures (and with what is drawn)
  const problems = [];
  const sideName = s => `${plain[s[0]] || s[0]}${plain[s[1]] || s[1]}`, angleName = v => `∠${plain[v] || v}`;
  for (const [g, what] of [[m, ''], ...(drawn !== m ? [[drawn, ' as drawn (drawAs)']] : [])]) {
    const groups = (marks, values, same, name, claim) => {
      const by = {};
      for (const [p, c] of Object.entries(marks)) (by[c] = by[c] || []).push(p);
      for (const ps of Object.values(by)) for (const p of ps.slice(1)) if (!same(values(ps[0]), values(p))) problems.push(`${claim} ${name(ps[0])} and ${name(p)}, but${what} they are not (${name(ps[0])}: ${r2(values(ps[0]))}, ${name(p)}: ${r2(values(p))})`);
    };
    groups(ticks, s => g.sides[s], (a, b) => Math.abs(a - b) <= TRI_SIDE_SLACK * Math.max(a, b), sideName, 'ticks claim equal sides');
    groups(arcs, v => g.angles[v], (a, b) => Math.abs(a - b) <= TRI_ANGLE_SLACK, angleName, 'arcs claim equal angles');
    const dir = s => { const p = g.corners[s[0]], q = g.corners[s[1]]; return Math.atan2(q[1] - p[1], q[0] - p[0]); };
    groups(arrows, s => dir(s), (a, b) => Math.abs(Math.sin(a - b)) < 1e-6, sideName, 'arrows claim parallel sides');
  }
  if (drawn !== m) for (const v of m.ids) if (truthRight(v) !== (Math.abs(drawn.angles[v] - 90) < SHP_RIGHT)) problems.push(`${angleName(v)} is ${truthRight(v) ? '' : 'not '}a right angle in the measures, so "drawAs" must draw it ${truthRight(v) ? 'as one' : 'as one that is not'} (a right angle's square must not lie)`);
  // a label that states a number states the true one (angles alone fix a triangle's shape, not its size: then the
  // first length stated sets the size and the rest must be in proportion)
  const valueOf = p => (p in m.angles && p.length === 1 ? m.angles[p] : p in m.sides ? m.sides[p] : p === 'side' ? m.poly.side : p === 'angle' ? m.poly.interior : m.extras[p]);
  let k = 1, sizedBy = null;
  for (const [p, l] of Object.entries(want)) {
    if (l === true || l === false) continue;
    const isAngle = (p.length === 1 && m.ids.includes(p)) || p === 'angle', c = shpClaim(l, isAngle ? '' : unit);
    if (c === null) continue;
    let v = valueOf(p);
    if (!isAngle && !m.sized) { if (!sizedBy) { k = c / v; sizedBy = p; } v *= k; }
    const ok = isAngle ? Math.abs(c - v) <= TRI_ANGLE_SLACK : Math.abs(c - v) <= TRI_SIDE_SLACK * Math.max(Math.abs(v), 1e-9);
    const nm = p.length === 1 && m.ids.includes(p) ? angleName(p) : /^[A-Z]{2}$/.test(p) ? sideName(p) : /^h[A-Z]$/.test(p) ? `the height from ${plain[p[1]] || p[1]}` : `the ${p}`;
    if (!ok) problems.push(`${nm} is labeled ${mathText(l)} but ${sizedBy && sizedBy !== p ? `with ${sideName(sizedBy)} labeled ${mathText(want[sizedBy])} it` : 'it'} is ${r2(v)}${isAngle ? '°' : ''}: a label that states a number must state the true one (make it the measure; to draw other proportions, add notToScale: true and drawAs)`);
  }
  if (problems.length) return { problems };

  return { problems: [], kind, K, m, drawn, names, plain, unit, round, scale: SHP_SIZES[d.size || 'medium'], want, ticks, arcs, arrows, heights, diagonals, cross: d.cross, rp,
    rightAngles, truthRight, flip: d.flip === true, rotate: d.rotate || 0, notToScale: d.notToScale === true, centerName: d.centerName, regNames: d.names === true };
}

// ---------------------------------------------------------------- drawing
const SHP_GROUPS = { sides: p => /^[A-Z]{2}$/.test(p) || p === 'side', angles: p => /^[A-Z]$/.test(p) || p === 'angle', heights: p => /^h[A-Z]$/.test(p), diagonals: p => p === 'AC' || p === 'BD', apothem: p => p === 'apothem', radius: p => p === 'radius' };
function shpDraw(r, o) {
  const P = palette(o), W = figWords(o.lang), m = r.m, g = r.drawn, reg = r.kind === 'regularPolygon';
  const hidden = p => o.hide === true || hides(o, p) || Object.entries(SHP_GROUPS).some(([name, is]) => hides(o, name) && is(p) && !(name === 'sides' && (p === 'AC' || p === 'BD')));
  const spec = { corners: [], angles: m.angles, sides: m.sides, sized: m.sized, labels: {}, arcs: r.arcs, ticks: r.ticks, arrows: r.arrows, right: [], heights: [], diagonals: [], unit: r.unit, round: r.round, flip: r.flip, rotate: r.rotate, scale: r.scale, lang: o.lang };
  const labelSpec = (p, typedKey) => {
    const l = r.want[p];
    if (l === undefined || l === false || hidden(p)) return null;
    if (l === true) return { mode: 'measure', typed: m.typed[typedKey || p] ?? null };
    return { mode: 'text', text: l };
  };
  spec.corners = m.ids.map(v => ({ id: v, name: reg ? (r.regNames ? v : '') : v in r.names ? r.names[v] : v, at: g.corners[v] }));
  if (reg) {
    const a = labelSpec('angle'), s = labelSpec('side', 'AB');
    if (a) spec.labels.A = a;
    if (s) spec.labels.AB = s;
    spec.arcs = Object.fromEntries(m.ids.map(v => [v, r.rp.arcs]));
    spec.ticks = Object.fromEntries(sidesOf(m.ids).map(([x]) => [x, r.rp.ticks]));
    spec.center = { at: [0, 0], dot: r.rp.center, name: r.centerName ?? '' };
    spec.spokes = [];
    if (r.rp.apothem) spec.spokes.push({ id: 'apothem', to: ['A', 'B'], style: 'dashed', label: labelSpec('apothem'), value: m.extras.apothem, square: r.rightAngles });
    if (r.rp.radius) spec.spokes.push({ id: 'radius', to: 'B', style: 'dashed', label: labelSpec('radius'), value: m.extras.radius });
    if (r.rp.radii) for (const v of m.ids) if (!(r.rp.radius && v === 'B')) spec.spokes.push({ id: `r${v}`, to: v, style: 'dashed', label: null });
  } else {
    for (const p of [...m.ids, ...Object.keys(m.sides)]) { const l = labelSpec(p); if (l) spec.labels[p] = l; }
    if (r.rightAngles) spec.right = m.ids.filter(r.truthRight);
    spec.heights = r.heights.map(h => ({ id: `h${h.from}`, from: h.from, onto: r.K.heightOnto(h.from), style: h.style, label: labelSpec(`h${h.from}`), value: m.extras[`h${h.from}`], foot: h.foot, square: r.rightAngles }));
    spec.diagonals = r.diagonals.map(dg => ({ id: dg.ends, ends: [dg.ends[0], dg.ends[1]], style: dg.style, label: labelSpec(dg.ends), value: m.extras[dg.ends] }));
    spec.cross = r.cross;
    if (r.diagonals.length === 2 && r.rightAngles) {
      const c = m.corners, u = [c.C[0] - c.A[0], c.C[1] - c.A[1]], w = [c.D[0] - c.B[0], c.D[1] - c.B[1]];
      spec.crossSquare = Math.abs(u[0] * w[0] + u[1] * w[1]) < 1e-6 * Math.hypot(...u) * Math.hypot(...w);
    }
  }
  if (reg && r.rightAngles) spec.right = m.ids.filter(r.truthRight);
  const L = layoutShape(spec), F = L.frame, X = r2, Y = r2;
  const pts = list => list.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
  const kids = [];
  kids.push(node('polygon', { points: pts(L.corners), fill: o.print ? 'none' : P.fill, stroke: 'none', class: 'of-fill' }));
  for (const [p, q] of L.extensions) kids.push(node('line', { x1: X(p[0]), y1: Y(p[1]), x2: X(q[0]), y2: Y(q[1]), stroke: P.ink2, 'stroke-width': 1.6, 'stroke-dasharray': '6 5', class: 'of-ext' }));
  for (const l of L.lines) {
    const cls = /^h[A-Z]$/.test(l.part) ? 'of-height' : l.part === 'AC' || l.part === 'BD' ? 'of-diagonal' : 'of-spoke';
    kids.push(node('line', { x1: X(l.from[0]), y1: Y(l.from[1]), x2: X(l.to[0]), y2: Y(l.to[1]), stroke: P.ink2, 'stroke-width': l.style === 'dotted' ? 2.4 : 1.8, 'stroke-dasharray': SHP_DASH[l.style], 'stroke-linecap': l.style === 'dotted' ? 'round' : null, class: cls, 'data-part': l.part }));
  }
  kids.push(node('g', { fill: 'none', stroke: P.ink, 'stroke-width': 1.6, class: 'of-marks' },
    L.squares.map(s => node('polyline', { points: pts(s), class: 'of-square' })),
    L.arcs.map(a => node('path', { d: a, class: 'of-arc' })),
    L.ticks.map(([p, q]) => node('line', { x1: X(p[0]), y1: Y(p[1]), x2: X(q[0]), y2: Y(q[1]), 'stroke-width': 1.8, class: 'of-tick' })),
    L.arrows.map(a => node('polyline', { points: pts(a), 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'of-arrow' }))));
  kids.push(node('polygon', { points: pts(L.corners), fill: 'none', stroke: P.ink, 'stroke-width': 2.4, 'stroke-linejoin': 'round', class: 'of-shape' }));
  for (const [x, y] of L.dots) kids.push(node('circle', { cx: X(x), cy: Y(y), r: 3.5, fill: P.ink, class: 'of-center' }));
  for (const l of L.labels) {
    const name = /^[vf][A-Z]$/.test(l.part) || l.part === 'x' || l.part === 'o';
    kids.push(node('g', { class: name ? 'of-name' : 'of-label', 'data-part': l.part }, mathNode(l.box, X(l.x), Y(l.y), { color: P.ink, halo: o.print ? null : P.paper })));
  }
  const all = [node('g', { transform: `translate(${r2(-F.x)} ${r2(-F.y)})` }, kids)];
  let h = F.h;
  if (r.notToScale) {
    all.push(node('g', { class: 'of-note' }, label(F.w / 2, F.h + SHP_NOTE_H / 2 - 4, W('notToScale'), { anchor: 'middle', size: 15, weight: 400, color: P.ink2, italic: true })));
    h += SHP_NOTE_H;
  }
  return frame(F.w, h, all, { ...o, kind: r.kind }, o.title || W(r.K.word(r.src)));
}

function shapeKind(kind) {
  return {
    check(d) { return shpRead(kind, d).problems; },
    draw(d, o) { const r = shpRead(kind, d); r.src = d; return shpDraw(r, o); },
    /** The numbers behind the figure, from its measures (never from drawAs): angles, sides, perimeter, area, and the
     *  kind's own (a triangle's heights, a quadrilateral's diagonals, a regular polygon's apothem and radius). */
    solve(d) { const r = shpRead(kind, d); return r.problems.length ? null : SHAPE_DEFS[kind].solve(r.m); },
  };
}
export const SHAPES = Object.fromEntries(Object.keys(SHAPE_DEFS).map(k => [k, shapeKind(k)]));
