// Oomba Figures: the geometry behind the measured shapes. A whole triangle from any three of its measures (SSS, SAS,
// ASA, AAS, SSA with its two answers, or angles alone, which fix its shape but not its size); where a quadrilateral's
// corners go from the measures each kind takes (square, rectangle, parallelogram, rhombus, trapezoid, isosceles and
// right trapezoid, kite); and a regular polygon's side, radius, apothem and angles from any one of the three lengths.
// Pure numbers: figures/src/shapes.js reads the figure's data, checks it, and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the measures arrive as numbers worked out from Oomba's structured values
// (a number, a fraction [n, d], { sqrt, times }), not typed text read by a math input library; the settings, page
// address and preset code around them is left out; messages say which measure to change in the same plain words, with
// a true minus sign; the triangle's corners and a quadrilateral's turn onto its base side are kept from the original's
// layout code; the parallelogram, rhombus and kite also refuse measures that make them a rectangle, a square or a rhombus
// (Oomba draws each figure one way).

const TRI_ANGLES = ['A', 'B', 'C'];
const TRI_SIDES = ['AB', 'BC', 'CA'];
/** The side across from each corner, and the corner across from each side. */
export const TRI_OPPOSITE = { A: 'BC', B: 'CA', C: 'AB', AB: 'C', BC: 'A', CA: 'B' };
// how far given measures can be off and still agree, since teachers give rounded values
export const TRI_ANGLE_SLACK = 0.5;   // degrees
export const TRI_SIDE_SLACK = 0.01;   // 1% of the side
const TRI_UNSIZED = 10;               // the longest side, when no side is given
const PG_RAD = Math.PI / 180;
const pgSin = d => Math.sin(d * PG_RAD);
const pgCos = d => Math.cos(d * PG_RAD);
const pgAcos = x => Math.acos(Math.max(-1, Math.min(1, x))) / PG_RAD;
const pgAsin = x => Math.asin(Math.max(-1, Math.min(1, x))) / PG_RAD;
/** A number for a message: at most two decimals, a true minus sign. */
const pgShow = v => String(Number(v.toFixed(2))).replace('-', '−');
/** The side between two corners, whichever way round it is asked for. */
export const triSideOf = (u, v) => TRI_SIDES.find(s => s.includes(u) && s.includes(v));

/**
 * given: { A, B, C (degrees), AB, BC, CA (lengths) }, null or undefined where not given. o.other: in the ambiguous case
 * (two sides and an angle not between them) the second triangle; o.names: how the corners read in messages.
 * -> { angles, sides, sized, ambiguous } or { problem, field }.
 */
export function solveTriangle(given, o = {}) {
  const names = o.names || {}, nm = v => names[v] || v;
  const sideName = s => `${nm(s[0])}${nm(s[1])}`, angleName = v => `∠${nm(v)}`;
  const fail = (problem, field = null) => ({ problem, field });
  const has = k => given[k] !== null && given[k] !== undefined;

  for (const v of TRI_ANGLES) if (has(v) && !(given[v] > 0 && given[v] < 180)) return fail(`${angleName(v)} has to be between 0° and 180°`, v);
  for (const s of TRI_SIDES) if (has(s) && !(given[s] > 0)) return fail(`${sideName(s)} has to be longer than 0`, s);
  const angs = TRI_ANGLES.filter(has), sides = TRI_SIDES.filter(has), count = angs.length + sides.length;
  if (angs.length < 2 && count < 3) { const more = 3 - count; return fail(`give ${more === 1 ? 'one more measure' : `${more} more measures`} to draw the triangle (any three of A, B, C, AB, BC, CA)`); }

  let angles, sized = true, ambiguous = false;
  if (angs.length >= 2) {
    // two angles fix the third, and then any one side fixes the size
    const sum = angs.reduce((t, v) => t + given[v], 0);
    if (angs.length === 3) {
      if (Math.abs(sum - 180) > TRI_ANGLE_SLACK) return fail(`${TRI_ANGLES.map(angleName).join(' + ')} is ${pgShow(sum)}°, not 180°`, angs[2]);
      angles = Object.fromEntries(TRI_ANGLES.map(v => [v, (given[v] * 180) / sum]));
    } else {
      const missing = TRI_ANGLES.find(v => !angs.includes(v));
      if (sum >= 180) return fail(`${angs.map(angleName).join(' + ')} is already ${pgShow(sum)}°, and a triangle's angles add up to 180°`, angs[1]);
      angles = { ...Object.fromEntries(angs.map(v => [v, given[v]])), [missing]: 180 - sum };
    }
    if (!sides.length) sized = false;
  } else if (sides.length === 3) {
    const [s1, s2, long] = [...TRI_SIDES].sort((x, y) => given[x] - given[y]);
    if (!(given[s1] + given[s2] > given[long] * (1 + 1e-9))) return fail(`these sides cannot make a triangle: ${sideName(s1)} + ${sideName(s2)} has to be longer than ${sideName(long)}`, long);
    angles = triFromSides(given);
  } else {
    // one angle and two sides: between them (SAS), or not (SSA)
    const v = angs[0], across = TRI_OPPOSITE[v];
    if (!has(across)) {
      const [p, q] = sides.map(s => given[s]), a = Math.sqrt(p * p + q * q - 2 * p * q * pgCos(given[v]));
      angles = triFromSides({ ...given, [across]: a });
    } else {
      // the side across from v is given, and so is one next to it, b. The angle across from b is w: sin w = b sin v / a,
      // which may have two answers
      const a = given[across], bSide = sides.find(s => s !== across), b = given[bSide], w = TRI_OPPOSITE[bSide];
      const u = TRI_ANGLES.find(x => x !== v && x !== w), reach = b * pgSin(given[v]);
      if (given[v] >= 90 && a <= b * (1 + 1e-9)) return fail(`${sideName(across)} has to be the longest side, since ${angleName(v)} is ${given[v] > 90 ? 'obtuse' : 'right'}`, across);
      if (a < reach * (1 - 1e-9)) return fail(`${sideName(across)} is too short to close the triangle: with these measures it has to be at least ${pgShow(reach)}`, across);
      const w1 = pgAsin(reach / a), w2 = 180 - w1;
      ambiguous = a < b * (1 - 1e-9) && reach < a * (1 - 1e-9) && given[v] + w2 < 180;
      const wAngle = ambiguous && o.other ? w2 : w1;
      angles = { [v]: given[v], [w]: wAngle, [u]: 180 - given[v] - wAngle };
    }
  }

  // sides from the angles by the law of sines, scaled to a given side
  const first = sides[0];
  const k = first ? given[first] / pgSin(angles[TRI_OPPOSITE[first]]) : TRI_UNSIZED / Math.max(...TRI_ANGLES.map(v => pgSin(angles[v])));
  const lengths = Object.fromEntries(TRI_SIDES.map(s => [s, k * pgSin(angles[TRI_OPPOSITE[s]])]));
  // every given measure has to agree with the triangle they make
  for (const s of sides) if (Math.abs(lengths[s] - given[s]) > TRI_SIDE_SLACK * given[s]) return fail(`with the other measures, ${sideName(s)} would be ${pgShow(lengths[s])}, not ${pgShow(given[s])}`, s);
  if (angs.length < 3) for (const v of angs) if (Math.abs(angles[v] - given[v]) > TRI_ANGLE_SLACK) return fail(`with the other measures, ${angleName(v)} would be ${pgShow(angles[v])}°, not ${pgShow(given[v])}°`, v);
  return { angles, sides: lengths, sized, ambiguous };
}
/** Angles from three sides, by the law of cosines. */
function triFromSides(s) {
  const len = { A: s.BC, B: s.CA, C: s.AB };
  const at = v => { const [p, q] = TRI_ANGLES.filter(x => x !== v).map(x => len[x]); return pgAcos((p * p + q * q - len[v] * len[v]) / (2 * p * q)); };
  return { A: at('A'), B: at('B'), C: at('C') };
}
/** A solved triangle's corners (y up): its base side flat along the bottom, the third corner above it. */
export function triCorners(t, base = 'AB') {
  const P = base[0], Q = base[1], R = TRI_ANGLES.find(v => v !== P && v !== Q), pr = t.sides[triSideOf(P, R)];
  return { [P]: [0, 0], [Q]: [t.sides[triSideOf(P, Q)], 0], [R]: [pr * pgCos(t.angles[P]), pr * pgSin(t.angles[P])] };
}

// ---------------------------------------------------------------- quadrilaterals
// Corners are always A, B, C and D, counterclockwise. Most kinds stand on AB, A at the bottom left; a trapezoid's bases
// are AB (bottom) and CD (top). A kite stands upright on its line of symmetry, B at the top and D at the bottom, its
// short sides AB and BC and long sides CD and DA.
export const QUAD_CORNERS = ['A', 'B', 'C', 'D'];
export const QUAD_SIDES = ['AB', 'BC', 'CD', 'DA'];
const quadOnBase = (w, h, dl, dr) => ({ A: [0, 0], B: [w, 0], C: [w - dr, h], D: [dl, h] });
const quadSlanted = (a, b, angle) => { const D = [b * pgCos(angle), b * pgSin(angle)]; return { A: [0, 0], B: [a, 0], C: [D[0] + a, D[1]], D }; };
/** The measures each kind takes, and the sides it makes equal to a given one. */
export const QUAD_KINDS = {
  square: { givens: ['AB'], equal: { BC: 'AB', CD: 'AB', DA: 'AB' } },
  rectangle: { givens: ['AB', 'BC'], equal: { CD: 'AB', DA: 'BC' } },
  parallelogram: { givens: ['AB', 'DA', 'A'], equal: { CD: 'AB', BC: 'DA' } },
  rhombus: { givens: ['AB', 'A'], equal: { BC: 'AB', CD: 'AB', DA: 'AB' } },
  trapezoid: { givens: ['AB', 'CD', 'h', 'A'], equal: {} },
  isosceles: { givens: ['AB', 'CD', 'h'], equal: {} },
  right: { givens: ['AB', 'CD', 'DA'], equal: {} },
  kite: { givens: ['AB', 'DA', 'B'], equal: { BC: 'AB', CD: 'DA' } },
};
/** g: the kind's measures as numbers; name(m): how a measure reads. -> { corners } or { problem, field }. */
export function quadCorners(type, g, name) {
  const fail = (problem, field) => ({ problem, field });
  const unequalBases = same => (Math.abs(g.AB - g.CD) < 1e-9 * Math.max(1, g.AB) ? fail(`with bases the same length this is ${same}: make ${name('AB')} and ${name('CD')} different lengths`, 'CD') : null);
  const notRight = (what, use) => (Math.abs(g.A - 90) < 1e-9 ? fail(`with ${name('A')} = 90° this is ${what}: draw it as a ${use}`, 'A') : null);
  let c;
  switch (type) {
    case 'square': c = { A: [0, 0], B: [g.AB, 0], C: [g.AB, g.AB], D: [0, g.AB] }; break;
    case 'rectangle': c = quadOnBase(g.AB, g.BC, 0, 0); break;
    case 'parallelogram': { const why = notRight('a rectangle', 'rectangle'); if (why) return why; if (Math.abs(g.AB - g.DA) < 1e-9 * Math.max(1, g.AB)) return fail(`with ${name('AB')} = ${name('DA')} this is a rhombus: say rhombus: true`, 'DA'); c = quadSlanted(g.AB, g.DA, g.A); break; }
    case 'rhombus': { const why = notRight('a square', 'rectangle with square: true'); if (why) return why; c = quadSlanted(g.AB, g.AB, g.A); break; }
    case 'trapezoid': { const why = unequalBases('a parallelogram'); if (why) return why; const dl = g.h / Math.tan(g.A * PG_RAD); c = quadOnBase(g.AB, g.h, dl, g.AB - g.CD - dl); break; }
    case 'isosceles': { const why = unequalBases('a rectangle'); if (why) return why; c = quadOnBase(g.AB, g.h, (g.AB - g.CD) / 2, (g.AB - g.CD) / 2); break; }
    case 'right': { const why = unequalBases('a rectangle'); if (why) return why; c = quadOnBase(g.AB, g.DA, 0, g.AB - g.CD); break; }
    case 'kite': {
      const half = (g.B / 2) * PG_RAD, w = g.AB * Math.sin(half), drop = g.AB * Math.cos(half);
      if (g.DA <= w + 1e-9) return fail(`${name('DA')} is too short to reach: with these measures it has to be longer than ${pgShow(w)}`, 'DA');
      if (Math.abs(g.DA - g.AB) < 1e-9 * Math.max(1, g.AB)) return fail(`with ${name('DA')} = ${name('AB')} this is a rhombus: draw it as a parallelogram with rhombus: true`, 'DA');
      c = { A: [w, -drop], B: [0, 0], C: [-w, -drop], D: [0, -drop - Math.sqrt(g.DA ** 2 - w ** 2)] };
      break;
    }
    default: return fail(`unknown kind of quadrilateral "${type}"`, null);
  }
  if (!quadConvex(c)) return fail('with these measures the sides cross or a corner points inward: no such shape', type === 'trapezoid' ? 'A' : null);
  return { corners: c };
}
/** Does the quadrilateral bulge outward at every corner, going counterclockwise? */
export function quadConvex(p) {
  return QUAD_CORNERS.every((v, i) => {
    const a = p[v], b = p[QUAD_CORNERS[(i + 1) % 4]], c = p[QUAD_CORNERS[(i + 2) % 4]];
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) > 1e-9;
  });
}
/** Each corner's angle in degrees, and each side's length. */
export function quadMeasure(p) {
  const angles = {}, sides = {};
  QUAD_CORNERS.forEach((v, i) => {
    const prev = p[QUAD_CORNERS[(i + 3) % 4]], next = p[QUAD_CORNERS[(i + 1) % 4]];
    const u = [prev[0] - p[v][0], prev[1] - p[v][1]], w = [next[0] - p[v][0], next[1] - p[v][1]];
    angles[v] = pgAcos((u[0] * w[0] + u[1] * w[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1])));
    sides[QUAD_SIDES[i]] = Math.hypot(next[0] - p[v][0], next[1] - p[v][1]);
  });
  return { angles, sides };
}
/** The corners turned so the chosen side runs along the bottom, left to right, with the rest above it. */
export function quadOnSide(corners, base) {
  if (!base) return corners;
  const p = corners[base[0]], q = corners[base[1]], turn = -Math.atan2(q[1] - p[1], q[0] - p[0]), c = Math.cos(turn), s = Math.sin(turn);
  return Object.fromEntries(QUAD_CORNERS.map(v => { const x = corners[v][0] - p[0], y = corners[v][1] - p[1]; return [v, [x * c - y * s, x * s + y * c]]; }));
}

// ---------------------------------------------------------------- regular polygons
/** A regular polygon from one length: by 'side', 'radius' or 'apothem'. -> { n, side, radius, apothem, interior, central }. */
export function rpMeasures(n, by, v) {
  const half = Math.PI / n, side = by === 'side' ? v : by === 'radius' ? 2 * v * Math.sin(half) : 2 * v * Math.tan(half);
  return { n, side, radius: side / (2 * Math.sin(half)), apothem: side / (2 * Math.tan(half)), interior: (180 * (n - 2)) / n, central: 360 / n };
}
/** Its corners' ids (A, B, C... around from the bottom left) and where they go (y up), side AB flat along the bottom. */
export function rpCorners(n, radius) {
  const ids = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i)), step = (2 * Math.PI) / n, start = -Math.PI / 2 - step / 2;
  return ids.map((id, i) => ({ id, at: [radius * Math.cos(start + i * step), radius * Math.sin(start + i * step)] }));
}
