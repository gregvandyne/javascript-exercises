// Oomba Figures: 3D solids and their nets. A prism, a cylinder, a pyramid, a cone and a sphere (or hemisphere), each
// drawn to scale from its measures in the oblique projection textbooks use, with hidden edges dashed, and the lines its
// measures sit on (a height, a radius, a slant height, a lean) drawn and labeled; and a solid's net, its faces laid out
// flat with fold lines dashed and cut edges solid. The geometry is ported (ported/solids.js, ported/nets.js); reading the
// data, the checks, the truth of every label, the answers (OF.solve) and the drawing are Oomba's own. Everything the
// figure says is true of the measures: a label that states a number states the true one (a slant height labeled 13 must
// be √(h² + r²)), and a net that does not fold into its solid is refused (docs/figures-api.md "3D solids and nets").
import { node, frame, palette, isNum, text, hides, r2, label } from './svg.js';
import { figWords } from './words.js';
import { mathBox, mathNode, mathText, mathProblem, mathValue } from './mathtext.js';
import { sdParts, sdSolve, sdPolyhedron, layoutSolid } from './ported/solids.js';
import { NT_CUBE_NETS, ntFoldCube, ntWhichCubeNet, layoutNet } from './ported/nets.js';

const SOL_SIZES = { small: 0.8, medium: 1, large: 1.4 };
const SOL_SLACK = 0.01;         // 1%: how far a stated or second measure may be off (teachers give rounded values)
const SOL_ANGLE_SLACK = 0.5;    // degrees
const SOL_FLAT = 40;            // the most one measure may be times another and still draw readably
const SOL_NOTE_H = 30;
const SOL_FS = 20;
const SOL_DASH = '6 5';
const SOL_LEN_HELP = 'a length: a number above 0, a fraction [n, d], or a root like { "sqrt": 5, "times": 3 } for 3√5';
// what each part is called in a message (and a solid's measures, in the order they are listed)
const SOL_NAMES = { length: 'length', width: 'width', triBase: 'triangle\'s base (triBase)', triHeight: 'triangle\'s height (triHeight)', hyp: 'triangle\'s slanted side (hyp)', side: 'side', apothem: 'apothem',
  radius: 'radius', diameter: 'diameter', height: 'height', lean: 'lean', edge: 'slanted edge (edge)', slant: 'slant height (slant)', slantW: 'slant height on the width (slantW)', circ: 'circumference (circ)', angle: 'sector angle' };
const SOL_BASES = ['rectangle', 'right', 'isosceles', 'regular'];
const SOL_COMMON = ['kind', 'hide', 'unit', 'round', 'size', 'labels', 'rightAngles'];
const SOL_OWN = {
  prism: ['base', 'length', 'width', 'triBase', 'triHeight', 'sides', 'side', 'height', 'oblique', 'lean', 'edge', 'leanTo', 'pose', 'depth', 'hidden', 'showHeight', 'names', 'notToScale', 'drawAs'],
  cylinder: ['radius', 'diameter', 'height', 'oblique', 'lean', 'edge', 'leanTo', 'hidden', 'showHeight', 'notToScale', 'drawAs'],
  pyramid: ['base', 'length', 'width', 'sides', 'side', 'height', 'slant', 'oblique', 'lean', 'leanTo', 'depth', 'hidden', 'showHeight', 'names', 'notToScale', 'drawAs'],
  cone: ['radius', 'diameter', 'height', 'slant', 'oblique', 'lean', 'leanTo', 'hidden', 'showHeight', 'notToScale', 'drawAs'],
  sphere: ['radius', 'diameter', 'hemisphere', 'bowl', 'hidden', 'notToScale'],
};
const SOL_MEASURES = ['length', 'width', 'triBase', 'triHeight', 'side', 'radius', 'diameter', 'height', 'lean', 'edge', 'slant'];

/** A length from the data: a number, a fraction [n, d], or { sqrt, times } -> { v, label (how it is written) } or null. */
export function solLen(x) {
  if (isNum(x) && x > 0 && x <= 1e6) return { v: x, label: x };
  if (Array.isArray(x) && x.length === 2 && Number.isInteger(x[0]) && Number.isInteger(x[1]) && x[0] > 0 && x[1] > 0 && x[0] <= 1e6 && x[1] <= 1e4) return { v: x[0] / x[1], label: { frac: [x[0], x[1]] } };
  if (x && typeof x === 'object' && !Array.isArray(x) && 'sqrt' in x && Object.keys(x).every(k => k === 'sqrt' || k === 'times') && !mathProblem(x)) {
    const v = mathValue(x);
    if (v !== null && v > 0 && v <= 1e6) return { v, label: x };
  }
  return null;
}
/** The number a label states (a trailing unit or degree sign set aside), or null. */
function solClaim(l, unit) {
  if (typeof l === 'string') { const s = l.trim().replace(/°$/, '').trim(); return mathValue(unit && s.endsWith(unit) ? s.slice(0, -unit.length).trim() : s); }
  return mathValue(l);
}
const solHas = (d, k) => d[k] !== undefined && d[k] !== null;
const solBool = (d, k, out) => { if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`); return d[k] === true; };
/** k as an exact multiple of π, written as a math label { pi: k } (a whole number, a short decimal or a fraction), or null. */
export function solPi(k) {
  if (!Number.isFinite(k)) return null;
  for (let d = 1; d <= 12; d++) {
    const n = Math.round(k * d);
    if (Math.abs(k * d - n) < 1e-9 * Math.max(1, Math.abs(k * d))) { const g = solGcd(Math.abs(n), d); return d / g === 1 ? { pi: n / g } : { pi: { frac: [n / g, d / g] } }; }
  }
  const t = Math.round(k * 1e4) / 1e4;
  return Math.abs(t - k) < 1e-9 ? { pi: t } : null;
}
const solGcd = (a, b) => (b ? solGcd(b, a % b) : a || 1);
/** √n for a whole n, simplified: [a, b] for a√b. */
function solRoot(n) { let a = 1, b = n; for (let f = 2; f * f <= b; f++) while (b % (f * f) === 0) { b /= f * f; a *= f; } return [a, b]; }

// ---------------------------------------------------------------- reading a solid's data
/** The solid's form (its shape and the choices that make it) from the data, and the problems. */
function solForm(kind, d, out) {
  const shape = kind === 'sphere' ? (d.hemisphere === true ? 'hemisphere' : 'sphere') : kind;
  let base = null, sides = 0;
  if (kind === 'prism' || kind === 'pyramid') {
    base = d.base === undefined ? 'rectangle' : d.base;
    const allowed = kind === 'pyramid' ? ['rectangle', 'regular'] : SOL_BASES;
    if (!allowed.includes(base)) { out.push(`"base" must be ${allowed.map(b => `"${b}"`).join(', ')}${kind === 'pyramid' ? ' (a pyramid\'s base is a rectangle or a regular polygon)' : ' ("right" and "isosceles" are triangles)'}`); return null; }
    if (base === 'regular') {
      sides = d.sides;
      if (sides === 4) { out.push(`a square base is base "rectangle" with length = width (one way to draw each solid): { "base": "rectangle", "length": ${solLen(d.side) ? solLen(d.side).v : 4}, "width": ${solLen(d.side) ? solLen(d.side).v : 4}, ... }`); return null; }
      if (!(Number.isInteger(sides) && sides >= 3 && sides <= 8)) { out.push('"sides" (a regular base\'s sides) must be 3, 5, 6, 7 or 8'); return null; }
    } else if (d.sides !== undefined) { out.push('"sides" goes with base "regular"'); return null; }
  }
  for (const k of ['oblique', 'hemisphere', 'bowl']) solBool(d, k, out);
  const oblique = d.oblique === true;
  if (shape === 'sphere' && d.bowl !== undefined) out.push('"bowl" goes with hemisphere: true (a hemisphere with its flat face up)');
  const pose = d.pose === undefined ? 'auto' : d.pose;
  if (!['auto', 'stand', 'lie'].includes(pose)) out.push('"pose" must be "stand" (on its base) or "lie" (on its side)');
  const lie = kind === 'prism' && base !== 'rectangle' && (pose === 'lie' || (pose === 'auto' && (base === 'right' || base === 'isosceles')));
  if (kind === 'prism' && base === 'rectangle' && pose === 'lie') out.push('a rectangular prism stands on a face whichever way it lies: leave out "pose" (swap the measures to turn it)');
  if (oblique && lie) out.push('a prism lying on its side cannot also lean: give pose: "stand" with oblique: true');
  return { shape, base, sides, lie, oblique };
}
/** Read the measures of a solid (or its drawAs) -> { given, typed } with problems in out. */
function solMeasures(kind, form, src, out, at) {
  const parts = sdParts(form), given = {}, typed = {}, n0 = out.length;
  const round = kind === 'cylinder' || kind === 'cone' || kind === 'sphere';
  if (round && solHas(src, 'radius') && solHas(src, 'diameter')) out.push(`${at}give the radius or the diameter, not both`);
  for (const k of SOL_MEASURES) {
    if (!solHas(src, k)) continue;
    const part = k === 'diameter' ? 'radius' : k;
    if (!parts.includes(part)) {
      const why = k === 'slant' && form.oblique ? 'an oblique solid has no single slant height: give its height and lean' : k === 'edge' && kind === 'prism' && !form.oblique ? 'a right prism\'s edges are its height' : k === 'lean' || k === 'edge' ? `"${k}" goes with oblique: true` : `this ${kind} is drawn from ${parts.filter(p => !['hyp', 'apothem'].includes(p)).map(p => (p === 'radius' ? 'radius (or diameter)' : p)).join(', ')}`;
      out.push(`${at}leave out "${k}": ${why}`); continue;
    }
    const l = solLen(src[k]);
    if (!l) { out.push(`${at}${k} must be ${SOL_LEN_HELP}`); continue; }
    given[part] = k === 'diameter' ? l.v / 2 : l.v; typed[k] = l.label;
  }
  if (out.length > n0) return null;
  const r = sdSolve(form, given, p => SOL_NAMES[p] || p, SOL_SLACK);
  if (r.problem) { out.push(`${at}${r.problem}`); return null; }
  const v = r.values;
  // look-alikes: one way to draw each solid
  if (form.base === 'isosceles') {
    if (Math.abs(v.triHeight - (v.triBase * Math.sqrt(3)) / 2) <= 1e-9 * v.triBase) { out.push(`${at}an isosceles base with all three sides equal is a regular triangle: base "regular" with sides: 3 and side`); return null; }
    if (Math.abs(v.triHeight - v.triBase / 2) <= 1e-9 * v.triBase) { out.push(`${at}an isosceles base with a right angle at the top is a right triangle: base "right" with triBase = triHeight`); return null; }
  }
  if (form.oblique && !(v.lean > 0)) { out.push(`${at}an oblique solid leans: give it a lean above 0 (or leave out oblique)`); return null; }
  const sizes = parts.filter(p => p !== 'hyp' && p !== 'apothem' && p !== 'edge' && p !== 'slant' && v[p] > 0).map(p => (p === 'radius' ? 2 * v[p] : v[p]));
  if (sizes.length > 1 && Math.max(...sizes) > SOL_FLAT * Math.min(...sizes)) { out.push(`${at}these measures are too far apart to draw readably (one is more than ${SOL_FLAT} times another): use notToScale: true with drawAs`); return null; }
  return { given, typed, v, parts };
}

function solRead(kind, d) {
  const keys = [...SOL_COMMON, ...SOL_OWN[kind]], odd = Object.keys(d).filter(k => !keys.includes(k));
  if (odd.length) {
    const hint = { cube: 'a cube is a prism with length = width = height', hemisphere: 'a hemisphere is a sphere with hemisphere: true', net: 'a net is its own kind: { kind: "net", solid: ... }', apothem: 'the apothem is worked out: show it with labels: { "apothem": true }' }[odd[0]];
    return { problems: [`${kind} does not take "${odd[0]}"${hint ? ` (${hint})` : ''} (it takes ${keys.filter(k => k !== 'kind' && k !== 'hide').join(', ')})`] };
  }
  const out = [], form = solForm(kind, d, out);
  if (!form) return { problems: out };
  const m = solMeasures(kind, form, d, out, '');
  if (!m) return { problems: out };
  const unit = d.unit === undefined ? '' : text(d.unit, 12);
  if (d.unit !== undefined && (typeof d.unit !== 'string' || d.unit.length > 12)) out.push('"unit" must be short text, like "cm" or "in"');
  const round = d.round === undefined ? 1 : d.round;
  if (![0, 1, 2].includes(round)) out.push('"round" must be 0, 1 or 2 (decimal places for the measures it works out)');
  if (d.size !== undefined && !SOL_SIZES[d.size]) out.push(`"size" must be one of ${Object.keys(SOL_SIZES).join(', ')}`);
  for (const k of ['leanTo', 'depth']) if (d[k] !== undefined && !['right', 'left'].includes(d[k])) out.push(`"${k}" must be "right" or "left"`);
  if (d.leanTo !== undefined && !form.oblique) out.push('"leanTo" goes with oblique: true');
  for (const k of ['hidden', 'showHeight', 'rightAngles', 'notToScale']) solBool(d, k, out);
  // names: true (A, B, C ...) or a list, one per corner: the bottom corners first, then the top ones (or the apex)
  const count = kind === 'prism' ? 2 * (form.base === 'rectangle' ? 4 : form.base === 'regular' ? form.sides : 3) : kind === 'pyramid' ? (form.base === 'rectangle' ? 4 : form.sides) + 1 : 0;
  let names = null;
  if (d.names === true) names = [];
  else if (Array.isArray(d.names)) {
    if (d.names.length !== count) out.push(`"names" must list ${count} names, one for each corner (the base's corners from the front left, counterclockwise, then ${kind === 'prism' ? 'the other base\'s' : 'the apex'})`);
    else { d.names.forEach((nm, i) => { const why = mathProblem(nm, `name ${i + 1}`); if (why) out.push(why); }); names = d.names; }
  } else if (d.names !== undefined && d.names !== false) out.push('"names" must be true (A, B, C ...) or a list of names, one for each corner');
  // the proportions drawn: the measures, or (not to scale) the drawAs measures of the same kind
  let drawn = m;
  if (d.drawAs !== undefined) {
    if (d.notToScale !== true) out.push('"drawAs" only goes with notToScale: true (a solid drawn to scale is drawn from its own measures)');
    else if (!d.drawAs || typeof d.drawAs !== 'object' || Array.isArray(d.drawAs)) out.push('"drawAs" must be the measures to draw, like { "length": 8, "width": 3, "height": 5 }');
    else {
      for (const k of Object.keys(d.drawAs)) if (!SOL_MEASURES.includes(k)) out.push(`"drawAs": "${k}" is not a measure (${SOL_MEASURES.join(', ')})`);
      if (!out.length) drawn = solMeasures(kind, form, d.drawAs, out, '"drawAs": ') || m;
    }
  }
  // labels: given measures show theirs, worked-out ones nothing, unless the data says otherwise
  const partsHere = [...m.parts, ...(solHas(d, 'diameter') ? ['diameter'] : [])].filter(p => !(p === 'radius' && solHas(d, 'diameter')));
  if (d.labels !== undefined && (!d.labels || typeof d.labels !== 'object' || Array.isArray(d.labels))) out.push(`"labels" must be { part: true, false or a label }, like { "${partsHere[0]}": "x" }`);
  const given = d.labels && typeof d.labels === 'object' && !Array.isArray(d.labels) ? d.labels : {};
  for (const [p, l] of Object.entries(given)) {
    if (!partsHere.includes(p)) { out.push(`"labels": "${p}" is not a part here (${partsHere.join(', ')})`); continue; }
    if (l === true || l === false) continue;
    const why = mathProblem(l, `the label of ${p}`);
    if (why) out.push(why);
  }
  if (out.length) return { problems: out };
  const want = {};
  for (const p of partsHere) want[p] = p in m.typed;
  Object.assign(want, given);
  // the truth: a label that states a number states the true measure
  const valueOf = p => (p === 'diameter' ? 2 * m.v.radius : m.v[p]);
  const problems = [];
  for (const [p, l] of Object.entries(want)) {
    if (l === true || l === false) continue;
    const c = solClaim(l, unit);
    if (c === null) continue;
    const v = valueOf(p);
    if (Math.abs(c - v) > SOL_SLACK * v) problems.push(`the ${SOL_NAMES[p]} is labeled ${mathText(l)} but it is ${r2(v)}${p === 'slant' ? ` (√(height² + ${kind === 'cone' ? 'radius' : form.base === 'regular' ? 'apothem' : '(width ÷ 2)'}²))` : ''}: a label that states a number must state the true one (make it the measure; to draw other proportions, add notToScale: true and drawAs)`);
  }
  if (problems.length) return { problems };
  return { problems: [], kind, form, m, drawn, unit, round, scale: SOL_SIZES[d.size || 'medium'], want, names, d,
    hidden: d.hidden !== false, showHeight: d.showHeight !== false, square: d.rightAngles !== false, notToScale: d.notToScale === true,
    dir: d.depth === 'left' ? -1 : 1, ld: d.leanTo === 'left' ? -1 : 1, diameter: solHas(d, 'diameter'), bowl: d.bowl === true };
}

// ---------------------------------------------------------------- the answers
function solSolve(r) {
  const { form, m } = r, v = m.v, kind = r.kind;
  const values = Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'number'));
  if (kind === 'prism' || kind === 'pyramid') {
    const P = sdPolyhedron(form, v, form.oblique ? v.lean : 0), baseArea = P.areas[0];
    const lateral = P.areas.slice(kind === 'prism' ? 2 : 1).reduce((t, a) => t + a, 0);
    const surface = lateral + baseArea * (kind === 'prism' ? 2 : 1);
    const nb = P.n, basePerimeter = P.faces[0].reduce((t, i, j) => { const a = P.corners[i], b = P.corners[P.faces[0][(j + 1) % nb]]; return t + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }, 0);
    const out = { shape: kind, base: form.base, oblique: form.oblique, values, baseArea, basePerimeter, lateralArea: lateral, surfaceArea: surface,
      volume: kind === 'prism' ? baseArea * v.height : (baseArea * v.height) / 3, height: v.height,
      faces: P.faces.length, edges: kind === 'prism' ? 3 * nb : 2 * nb, vertices: P.corners.length };
    if (kind === 'pyramid' && !form.oblique) {
      out.slant = v.slant;
      if (form.base === 'rectangle') { out.slantLength = v.slant; out.slantWidth = Math.hypot(v.height, v.length / 2); }
      const c = P.corners[nb], b0 = P.corners[0]; out.lateralEdge = Math.hypot(c[0] - b0[0], c[1] - b0[1], c[2] - b0[2]);
    }
    if (kind === 'prism' && form.oblique) out.edge = v.edge;
    return out;
  }
  const rr = v.radius, pi = Math.PI;
  const exact = {}, put = (k, coef) => { const e = solPi(coef); if (e) exact[k] = e; };
  if (kind === 'cylinder') {
    const out = { shape: 'cylinder', oblique: form.oblique, values, radius: rr, diameter: 2 * rr, height: v.height, circumference: 2 * pi * rr, baseArea: pi * rr * rr, volume: pi * rr * rr * v.height };
    put('volume', rr * rr * v.height); put('baseArea', rr * rr); put('circumference', 2 * rr);
    if (!form.oblique) { out.lateralArea = 2 * pi * rr * v.height; out.surfaceArea = 2 * pi * rr * rr + out.lateralArea; put('lateralArea', 2 * rr * v.height); put('surfaceArea', 2 * rr * rr + 2 * rr * v.height); }
    else { out.lateralArea = null; out.surfaceArea = null; out.why = 'an oblique cylinder\'s curved surface has no school formula (its volume is π r² h all the same)'; out.edge = v.edge; }
    return { ...out, exact };
  }
  if (kind === 'cone') {
    const out = { shape: 'cone', oblique: form.oblique, values, radius: rr, diameter: 2 * rr, height: v.height, baseArea: pi * rr * rr, volume: (pi * rr * rr * v.height) / 3 };
    put('volume', (rr * rr * v.height) / 3); put('baseArea', rr * rr);
    if (!form.oblique) {
      const l = v.slant; out.slant = l; out.lateralArea = pi * rr * l; out.surfaceArea = pi * rr * rr + pi * rr * l; out.sectorAngle = (360 * rr) / l;
      put('lateralArea', rr * l); put('surfaceArea', rr * rr + rr * l);
      // a slant height that is a root (√41): the curved area as π r √n
      const l2 = v.height * v.height + rr * rr;
      if (!exact.lateralArea && Math.abs(l2 - Math.round(l2)) < 1e-9 && Number.isInteger(rr)) { const [a, b] = solRoot(Math.round(l2)); exact.slant = b === 1 ? a : a === 1 ? { sqrt: b } : { sqrt: b, times: a }; exact.lateralArea = { pi: b === 1 ? rr * a : [rr * a, { sqrt: b }] }; }
    } else { out.slant = null; out.lateralArea = null; out.surfaceArea = null; out.why = 'an oblique cone\'s curved surface has no school formula (its volume is π r² h ÷ 3 all the same)'; }
    return { ...out, exact };
  }
  const hemi = form.shape === 'hemisphere';
  const out = { shape: form.shape, values, radius: rr, diameter: 2 * rr, volume: ((hemi ? 2 : 4) * pi * rr ** 3) / 3, surfaceArea: (hemi ? 3 : 4) * pi * rr * rr };
  put('volume', ((hemi ? 2 : 4) * rr ** 3) / 3); put('surfaceArea', (hemi ? 3 : 4) * rr * rr);
  if (hemi) { out.curvedArea = 2 * pi * rr * rr; out.baseArea = pi * rr * rr; put('curvedArea', 2 * rr * rr); put('baseArea', rr * rr); }
  return { ...out, exact };
}

// ---------------------------------------------------------------- drawing
function solDraw(r, o) {
  const P = palette(o), W = figWords(o.lang), m = r.m, lang = o.lang;
  const hidden = p => o.hide === true || hides(o, p) || (p === 'radius' && hides(o, 'diameter'));
  const unitText = r.unit ? ` ${r.unit}` : '';
  const FS = SOL_FS * r.scale;
  const content = part => {
    const key = part === 'radius' && r.diameter ? 'diameter' : part, l = r.want[key];
    if (l === undefined || l === false || hidden(key)) return null;
    if (l === true) {
      const typed = m.typed[key];
      const value = key === 'diameter' ? 2 * m.v.radius : m.v[key];
      return mathBox(typed !== undefined ? typed : Number(value.toFixed(r.round)), FS, { lang, suffix: unitText });
    }
    return mathBox(l, FS, { lang });
  };
  const L = layoutSolid({ form: r.form, v: r.drawn.v, dir: r.dir, ld: r.ld, bowl: r.bowl, hidden: r.hidden, showHeight: r.showHeight, square: r.square, names: r.names, content, scale: r.scale, lang, diameter: r.diameter });
  const F = L.frame, kids = [];
  const pts = list => list.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');
  kids.push(node('g', { fill: 'none', stroke: P.ink2, 'stroke-width': 1.6, 'stroke-dasharray': SOL_DASH, class: 'of-hidden' },
    L.edges.filter(e => e.hidden).map(e => node('line', { x1: r2(e.a[0]), y1: r2(e.a[1]), x2: r2(e.b[0]), y2: r2(e.b[1]) })),
    L.arcs.filter(a => a.hidden).map(a => node('path', { d: a.d }))));
  kids.push(node('g', { fill: 'none', stroke: P.ink2, 'stroke-width': 1.6, class: 'of-marks' },
    L.extras.map(e => node('line', { x1: r2(e.a[0]), y1: r2(e.a[1]), x2: r2(e.b[0]), y2: r2(e.b[1]), 'stroke-dasharray': e.dashed ? SOL_DASH : null, class: 'of-measure', 'data-part': e.part })),
    L.squares.map(s => node('polyline', { points: pts(s), class: 'of-square' }))));
  kids.push(node('g', { fill: 'none', stroke: P.ink, 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'of-edges' },
    L.edges.filter(e => !e.hidden).map(e => node('line', { x1: r2(e.a[0]), y1: r2(e.a[1]), x2: r2(e.b[0]), y2: r2(e.b[1]) })),
    L.arcs.filter(a => !a.hidden).map(a => node('path', { d: a.d }))));
  for (const [x, y] of L.dots) kids.push(node('circle', { cx: r2(x), cy: r2(y), r: 3.5, fill: P.ink, class: 'of-center' }));
  for (const l of L.labels) kids.push(node('g', { class: /^v[A-Z]/.test(l.part) ? 'of-name' : 'of-label', 'data-part': l.part === 'radius' && r.diameter ? 'diameter' : l.part }, mathNode(l.box, r2(l.x), r2(l.y), { color: P.ink, halo: o.print ? null : P.paper })));
  const all = [node('g', { transform: `translate(${r2(-F.x)} ${r2(-F.y)})` }, kids)];
  let h = F.h;
  if (r.notToScale) { all.push(node('g', { class: 'of-note' }, label(F.w / 2, F.h + SOL_NOTE_H / 2 - 4, W('notToScale'), { anchor: 'middle', size: 15, weight: 400, color: P.ink2, italic: true }))); h += SOL_NOTE_H; }
  return frame(F.w, h, all, { ...o, kind: r.kind }, o.title || W(r.form.shape));
}

function solidKind(kind) {
  return {
    check(d) { return solRead(kind, d).problems; },
    draw(d, o) { return solDraw(solRead(kind, d), o); },
    /** The numbers behind the solid, from its measures (never from drawAs): every measure, the base's area, the lateral
     *  and total surface area, the volume (and the slant height, faces, edges and corners where it has them), with
     *  exact multiples of π for round solids (exact: { volume: { pi: 12 } }). */
    solve(d) { const r = solRead(kind, d); return r.problems.length ? null : solSolve(r); },
  };
}

// ---------------------------------------------------------------- nets
const NET_SOLIDS = ['cube', 'prism', 'pyramid', 'cylinder', 'cone'];
const NET_KEYS = ['kind', 'hide', 'solid', 'net', 'cells', 'base', 'length', 'width', 'triBase', 'triHeight', 'sides', 'side', 'radius', 'diameter', 'height', 'slant', 'fold', 'faces', 'shade', 'tabs', 'labels', 'unit', 'round', 'size', 'rightAngles'];
const NET_SHOWN = ['hyp', 'slantW', 'slant'];   // worked out, but shown from the start: a net is for surface area
const NET_TINTS = ['#E1F1E1', '#E9F3FA', '#FBF0D9', '#F6E3E0', '#ECE6F6', '#F4F1E6'];
const NET_GRAYS = ['#FFFFFF', '#E6E6E6', '#CCCCCC', '#F2F2F2', '#D9D9D9', '#BFBFBF'];
function netRead(d) {
  const odd = Object.keys(d).filter(k => !NET_KEYS.includes(k));
  if (odd.length) {
    const hint = { oblique: 'a net is of a right solid (a leaning one does not unfold into these faces)', notToScale: 'a net is cut out and folded, so it is always drawn to scale', hemisphere: 'a sphere has no net', shape: 'the solid is "solid"' }[odd[0]];
    return { problems: [`net does not take "${odd[0]}"${hint ? ` (${hint})` : ''} (it takes ${NET_KEYS.filter(k => k !== 'kind' && k !== 'hide').join(', ')})`] };
  }
  const out = [], solid = d.solid;
  if (!NET_SOLIDS.includes(solid)) return { problems: [`"solid" must be ${NET_SOLIDS.map(s => `"${s}"`).join(', ')} (a sphere has no net)`] };
  let form, m;
  if (solid === 'cube') {
    for (const k of ['base', 'length', 'width', 'triBase', 'triHeight', 'sides', 'radius', 'diameter', 'height', 'slant']) if (d[k] !== undefined) out.push(`a cube's net is drawn from its edge "side": leave out "${k}"`);
    const l = solLen(d.side);
    if (!l) out.push(`"side" (the cube's edge) must be ${SOL_LEN_HELP}`);
    let cells = null;
    if (d.net !== undefined && d.cells !== undefined) out.push('give "net" (1 to 11) or "cells", not both');
    else if (d.cells !== undefined) {
      if (!Array.isArray(d.cells) || d.cells.length !== 6 || !d.cells.every(c => Array.isArray(c) && c.length === 2 && c.every(x => Number.isInteger(x) && x >= 0 && x <= 5))) out.push('"cells" must be six squares [column, row] (whole numbers 0 to 5), like [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]]');
      else if (new Set(d.cells.map(c => c.join(','))).size !== 6) out.push('"cells": two squares are in the same place');
      else if (!ntFoldCube(d.cells)) out.push('these six squares do not fold into a cube (two of them land on the same face, or they are not all joined edge to edge): a cube has 11 nets, "net": 1 to 11');
      else cells = d.cells;
    } else {
      const k = d.net === undefined ? 1 : d.net;
      if (!(Number.isInteger(k) && k >= 1 && k <= 11)) out.push('"net" must be 1 to 11 (a cube has 11 nets; 1 is the cross)');
      else cells = NT_CUBE_NETS[k - 1];
    }
    if (out.length) return { problems: out };
    form = { solid, cells, which: ntWhichCubeNet(cells) };
    m = { v: { side: l.v }, typed: { side: l.label }, parts: ['side'] };
  } else {
    if (d.net !== undefined || d.cells !== undefined) return { problems: [`"${d.net !== undefined ? 'net' : 'cells'}" picks a cube's net: it goes with solid: "cube"`] };
    const sForm = solForm(solid, { base: d.base, sides: d.sides }, out);
    if (!sForm) return { problems: out };
    const src = Object.fromEntries(SOL_MEASURES.filter(k => d[k] !== undefined).map(k => [k, d[k]]));
    const sm = solMeasures(solid, sForm, src, out, '');
    if (!sm) return { problems: out };
    const v = { ...sm.v };
    const parts = [];
    if (solid === 'prism' || solid === 'pyramid') {
      if (sForm.base === 'rectangle') parts.push('length', 'width'); else if (sForm.base === 'regular') parts.push('side', 'apothem'); else parts.push('triBase', 'triHeight', 'hyp');
    }
    if (solid === 'prism') parts.push('height');
    if (solid === 'cylinder' || solid === 'cone') parts.push('radius');
    if (solid === 'cylinder') { parts.push('height', 'circ'); v.circ = 2 * Math.PI * v.radius; }
    if (solid === 'pyramid' || solid === 'cone') {
      parts.push('slant');
      if (solid === 'pyramid' && sForm.base === 'rectangle' && Math.abs(v.length - v.width) > 1e-9 * v.length) { parts.push('slantW'); v.slantW = Math.hypot(v.height, v.length / 2); }
      if (solid === 'cone') { parts.push('angle'); v.angle = (360 * v.radius) / v.slant; }
    }
    if (solid === 'prism' && sForm.base === 'rectangle' && [v.width, v.height].every(x => Math.abs(x - v.length) <= 1e-9 * v.length)) return { problems: [`a prism with length, width and height all equal is a cube: { "solid": "cube", "side": ${v.length} } (a cube has its own 11 nets)`] };
    if (solid === 'cone' && v.angle >= 360 - 1e-9) return { problems: ['this cone\'s slant height is too short to unroll its side'] };
    form = { solid, base: sForm.base, sides: sForm.sides };
    m = { v, typed: sm.typed, parts: parts.map(p => (p === 'radius' && solHas(d, 'diameter') ? 'diameter' : p)), sForm };
  }
  const unit = d.unit === undefined ? '' : text(d.unit, 12);
  if (d.unit !== undefined && (typeof d.unit !== 'string' || d.unit.length > 12)) out.push('"unit" must be short text, like "cm" or "in"');
  const round = d.round === undefined ? 1 : d.round;
  if (![0, 1, 2].includes(round)) out.push('"round" must be 0, 1 or 2');
  if (d.size !== undefined && !SOL_SIZES[d.size]) out.push(`"size" must be one of ${Object.keys(SOL_SIZES).join(', ')}`);
  if (d.fold !== undefined && !['dashed', 'solid'].includes(d.fold)) out.push('"fold" (how fold lines are drawn) must be "dashed" or "solid"');
  if (d.faces !== undefined && !['names', 'areas', 'both'].includes(d.faces)) out.push('"faces" (what is written in each face) must be "names", "areas" or "both"');
  for (const k of ['shade', 'tabs', 'rightAngles']) solBool(d, k, out);
  if (d.labels !== undefined && (!d.labels || typeof d.labels !== 'object' || Array.isArray(d.labels))) out.push(`"labels" must be { part: true, false or a label }, like { "${m.parts[0]}": "x" }`);
  const given = d.labels && typeof d.labels === 'object' && !Array.isArray(d.labels) ? d.labels : {};
  for (const [p, l] of Object.entries(given)) {
    if (!m.parts.includes(p)) { out.push(`"labels": "${p}" is not a part of this net (${m.parts.join(', ')})`); continue; }
    if (l !== true && l !== false) { const why = mathProblem(l, `the label of ${p}`); if (why) out.push(why); }
  }
  if (out.length) return { problems: out };
  const want = {};
  for (const p of m.parts) want[p] = p in m.typed || NET_SHOWN.includes(p);
  Object.assign(want, given);
  const valueOf = p => (p === 'diameter' ? 2 * m.v.radius : m.v[p]);
  const problems = [];
  for (const [p, l] of Object.entries(want)) {
    if (l === true || l === false) continue;
    const c = solClaim(l, p === 'angle' ? '' : unit);
    if (c === null) continue;
    const v = valueOf(p), ok = p === 'angle' ? Math.abs(c - v) <= SOL_ANGLE_SLACK : Math.abs(c - v) <= SOL_SLACK * v;
    if (!ok) problems.push(`the ${SOL_NAMES[p]} is labeled ${mathText(l)} but it is ${r2(v)}${p === 'angle' ? '°' : ''}: a label that states a number must state the true one`);
  }
  if (problems.length) return { problems };
  return { problems: [], form, m, unit, round, scale: SOL_SIZES[d.size || 'medium'], want, d, diameter: solHas(d, 'diameter'),
    fold: d.fold || 'dashed', faceText: d.faces || null, shade: d.shade === true, tabs: d.tabs === true, square: d.rightAngles !== false };
}
function netSolve(r) {
  const L = layoutNet({ form: r.form, v: r.m.v, diameter: r.diameter, content: () => null });
  const total = L.faceAreas.reduce((t, a) => t + a, 0);
  const out = { solid: r.form.solid, faces: L.faces.map(f => ({ name: f.name, shape: f.kind === 'poly' ? 'polygon' : f.kind, area: f.area })), surfaceArea: total, values: { ...r.m.v } };
  if (r.form.solid === 'cube') { out.net = r.form.which; out.volume = r.m.v.side ** 3; }
  else {
    const s = solSolve({ kind: r.form.solid, form: { ...r.m.sForm, oblique: false }, m: { v: r.m.v } });
    out.volume = s.volume; out.lateralArea = s.lateralArea;
    if (s.exact) out.exact = { surfaceArea: s.exact.surfaceArea, lateralArea: s.exact.lateralArea };
    if (r.form.solid === 'cylinder') out.circumference = r.m.v.circ;
    if (r.form.solid === 'cone') out.sectorAngle = r.m.v.angle;
  }
  return out;
}
function netDraw(r, o) {
  const P = palette(o), W = figWords(o.lang), lang = o.lang, m = r.m, FS = SOL_FS * r.scale;
  const unitText = r.unit ? ` ${r.unit}` : '', areaUnit = r.unit ? ` ${r.unit}²` : '';
  const hidden = p => o.hide === true || hides(o, p) || (p === 'radius' && hides(o, 'diameter'));
  const content = part => {
    const key = part === 'radius' && r.diameter ? 'diameter' : part, l = r.want[key];
    if (l === undefined || l === false || hidden(key)) return null;
    if (l === true) {
      if (key === 'angle') return mathBox(Number(m.v.angle.toFixed(r.round)), FS, { lang, suffix: '°' });
      const typed = m.typed[key], value = key === 'diameter' ? 2 * m.v.radius : m.v[key];
      return mathBox(typed !== undefined ? typed : Number(value.toFixed(r.round)), FS, { lang, suffix: unitText });
    }
    return mathBox(l, FS, { lang });
  };
  const faceText = r.faceText ? (name, area) => [
    r.faceText !== 'areas' ? mathBox({ text: name }, FS, { lang }) : null,
    r.faceText !== 'names' && !(o.hide === true || hides(o, 'areas')) ? mathBox(Number(area.toFixed(r.round)), FS * 0.9, { lang, suffix: areaUnit }) : null,
  ] : null;
  const L = layoutNet({ form: r.form, v: m.v, diameter: r.diameter, tabs: r.tabs, faceText, content, scale: r.scale, square: r.square, lang });
  const F = L.frame, kids = [], pts = list => list.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');
  const fillOf = f => (r.shade ? (o.print ? NET_GRAYS : NET_TINTS)[f.group % 6] : o.print ? '#FFFFFF' : P.paper);
  kids.push(node('g', { class: 'of-tabs', fill: o.print ? '#DDDDDD' : P.soft, stroke: P.ink, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, L.tabs.map(t => node('polygon', { points: pts(t) }))));
  kids.push(node('g', { class: 'of-faces' }, L.faces.map(f => node('path', { d: f.d, fill: fillOf(f), class: 'of-face', 'data-face': f.name }))));
  kids.push(node('g', { fill: 'none', stroke: P.ink2, 'stroke-width': 1.6, class: 'of-marks' },
    L.extras.map(e => node('line', { x1: r2(e.a[0]), y1: r2(e.a[1]), x2: r2(e.b[0]), y2: r2(e.b[1]), 'stroke-dasharray': e.dashed ? SOL_DASH : null, class: 'of-measure', 'data-part': e.part })),
    L.squares.map(s => node('polyline', { points: pts(s), class: 'of-square' })), L.arcs.map(a => node('path', { d: a, class: 'of-arc' }))));
  kids.push(node('g', { fill: 'none', stroke: P.ink, 'stroke-width': 1.6, 'stroke-dasharray': r.fold === 'dashed' ? SOL_DASH : null, class: 'of-folds' },
    L.folds.map(e => node('line', { x1: r2(e.a[0]), y1: r2(e.a[1]), x2: r2(e.b[0]), y2: r2(e.b[1]), class: 'of-fold' }))));
  kids.push(node('g', { fill: 'none', stroke: P.ink, 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'of-cuts' },
    L.cuts.map(e => node('line', { x1: r2(e.a[0]), y1: r2(e.a[1]), x2: r2(e.b[0]), y2: r2(e.b[1]), class: 'of-cut' })), L.curves.map(c => node('path', { d: c, class: 'of-cut' }))));
  for (const [x, y] of L.dots) kids.push(node('circle', { cx: r2(x), cy: r2(y), r: 3.5, fill: P.ink, class: 'of-center' }));
  for (const l of L.labels) kids.push(node('g', { class: /^[fa][A-Z]$/.test(l.part) ? 'of-facetext' : 'of-label', 'data-part': l.part === 'radius' && r.diameter ? 'diameter' : l.part }, mathNode(l.box, r2(l.x), r2(l.y), { color: P.ink })));
  return frame(F.w, F.h, [node('g', { transform: `translate(${r2(-F.x)} ${r2(-F.y)})` }, kids)], { ...o, kind: 'net' }, o.title || `${W('net')}: ${W(r.form.solid)}`);
}
export const net = {
  check(d) { return netRead(d).problems; },
  draw(d, o) { return netDraw(netRead(d), o); },
  /** The net's faces (named A, B, C ... in reading order) and their areas, which add up to the solid's surface area; the
   *  solid's volume; which of the 11 cube nets a cube's is. */
  solve(d) { const r = netRead(d); return r.problems.length ? null : netSolve(r); },
};

export const SOLID_KINDS = { prism: solidKind('prism'), cylinder: solidKind('cylinder'), pyramid: solidKind('pyramid'), cone: solidKind('cone'), sphere: solidKind('sphere'), net };
