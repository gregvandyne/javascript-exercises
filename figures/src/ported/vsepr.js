// Oomba Figures: a VSEPR shape in 3D. Each count of atoms (X) and lone groups (E) around a central atom has its shape's
// name, its electron geometry, where each outer atom and lone pair points (unit vectors in the textbook view: x right,
// y down, z toward the viewer), the view's tilt and turn (so a wedge and a dash on one side, or two lone pairs toward
// and away, never land on each other), and its kinds of bond angle (ideal, and whether lone pairs squeeze them). A
// trigonal bipyramid puts the most electronegative atoms axial; a square pyramid puts the odd atom out at its apex (O in
// XeOF4); a planar radical (three atoms and a lone electron round a period 2 atom, as CH3) keeps its 120 degrees, and
// a lone electron squeezes no angle. Also the view's turn, the flat page angles lone pairs are drawn at (pushed apart
// from the bonds and each other), and the ball-and-stick colors (the usual model-kit colors) with their grays for
// print, set apart by hand so atoms that share a molecule never print alike. Pure numbers in, pure numbers out:
// figures/src/vsepr.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the shape is found from counts and a list of outer atoms (Oomba's own
// molecule table) instead of from a built Lewis structure, and the electronegativities come from the caller; the
// figure's layout (sizes, arcs, brackets, lines under it), the settings and the words are left out.

const VS_S3 = Math.sqrt(3) / 2, VS_R2 = Math.SQRT1_2;
const VS_TA = [0, -1, 0], VS_TB = [-0.9428, 0.3333, 0], VS_TC = [0.4714, 0.3333, 0.8165], VS_TD = [0.4714, 0.3333, -0.8165];
const VS_UP = [0, -1, 0], VS_DOWN = [0, 1, 0], VS_E1 = [-1, 0, 0], VS_E2 = [0.5, 0, VS_S3], VS_E3 = [0.5, 0, -VS_S3];
const VS_SQUARE = [[VS_R2, 0, VS_R2], [-VS_R2, 0, VS_R2], [-VS_R2, 0, -VS_R2], [VS_R2, 0, -VS_R2]];
const vsAllPairs = n => Array.from({ length: n }, (_, i) => Array.from({ length: n - i - 1 }, (_, j) => [i, i + j + 1])).flat();
const vsRoundSquare = from => [0, 1, 2, 3].map(i => [from + i, from + ((i + 1) % 4)]);
/** Every shape drawn, by "atoms,lone groups" around the central atom. */
export const VS_SHAPES = {
  '1,0': { name: 'linear', geometry: 'linear', atoms: [[1, 0, 0]], lone: [], tilt: 0, angles: [] },
  '1,1': { name: 'linear', geometry: 'linear', atoms: [[1, 0, 0]], lone: [[-1, 0, 0]], tilt: 0, angles: [] },
  '1,2': { name: 'linear', geometry: 'trigonal planar', atoms: [[1, 0, 0]], lone: [[-0.5, -VS_S3, 0], [-0.5, VS_S3, 0]], tilt: 0, angles: [] },
  '1,3': { name: 'linear', geometry: 'tetrahedral', atoms: [[1, 0, 0]], lone: [[-0.3333, -0.9428, 0], [-0.3333, 0.4714, 0.8165], [-0.3333, 0.4714, -0.8165]], tilt: -20, angles: [] },
  '2,0': { name: 'linear', geometry: 'linear', atoms: [[-1, 0, 0], [1, 0, 0]], lone: [], tilt: 0, angles: [{ ideal: 180, squeezed: false, pairs: [[0, 1]] }] },
  '2,1': { name: 'bent', geometry: 'trigonal planar', atoms: [[-VS_S3, 0.5, 0], [VS_S3, 0.5, 0]], lone: [VS_UP], tilt: 0, angles: [{ ideal: 120, squeezed: true, pairs: [[0, 1]] }] },
  '2,2': { name: 'bent', geometry: 'tetrahedral', atoms: [[-0.8165, 0.5774, 0], [0.8165, 0.5774, 0]], lone: [[0, -0.5774, 0.8165], [0, -0.5774, -0.8165]], tilt: 0, yaw: 28, angles: [{ ideal: 109.5, squeezed: true, pairs: [[0, 1]] }] },
  '2,3': { name: 'linear', geometry: 'trigonal bipyramidal', atoms: [[-1, 0, 0], [1, 0, 0]], lone: [VS_UP, [0, 0.5, VS_S3], [0, 0.5, -VS_S3]], tilt: -20, angles: [{ ideal: 180, squeezed: false, pairs: [[0, 1]] }] },
  '3,0': { name: 'trigonal planar', geometry: 'trigonal planar', atoms: [VS_UP, [-VS_S3, 0.5, 0], [VS_S3, 0.5, 0]], lone: [], tilt: 0, angles: [{ ideal: 120, squeezed: false, pairs: vsAllPairs(3) }] },
  '3,1': { name: 'trigonal pyramidal', geometry: 'tetrahedral', atoms: [VS_TB, VS_TC, VS_TD], lone: [VS_TA], tilt: -20, angles: [{ ideal: 109.5, squeezed: true, pairs: vsAllPairs(3) }] },
  '3,2': { name: 'T-shaped', geometry: 'trigonal bipyramidal', atoms: [VS_UP, VS_DOWN, VS_E1], lone: [VS_E2, VS_E3], tilt: -20, angles: [{ ideal: 90, squeezed: true, pairs: [[0, 2], [1, 2]] }], byEn: true },
  '4,0': { name: 'tetrahedral', geometry: 'tetrahedral', atoms: [VS_TA, VS_TB, VS_TC, VS_TD], lone: [], tilt: -20, angles: [{ ideal: 109.5, squeezed: false, pairs: vsAllPairs(4) }] },
  '4,1': { name: 'seesaw', geometry: 'trigonal bipyramidal', atoms: [VS_UP, VS_DOWN, VS_E2, VS_E3], lone: [VS_E1], tilt: -20, angles: [{ ideal: 90, squeezed: true, pairs: [[0, 2], [0, 3], [1, 2], [1, 3]] }, { ideal: 120, squeezed: true, pairs: [[2, 3]] }], byEn: true },
  '4,2': { name: 'square planar', geometry: 'octahedral', atoms: VS_SQUARE, lone: [VS_UP, VS_DOWN], tilt: -35, angles: [{ ideal: 90, squeezed: false, pairs: vsRoundSquare(0) }] },
  '5,0': { name: 'trigonal bipyramidal', geometry: 'trigonal bipyramidal', atoms: [VS_UP, VS_DOWN, VS_E1, VS_E2, VS_E3], lone: [], tilt: -20, angles: [{ ideal: 90, squeezed: false, pairs: [[0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4]] }, { ideal: 120, squeezed: false, pairs: [[2, 3], [2, 4], [3, 4]] }], byEn: true },
  '5,1': { name: 'square pyramidal', geometry: 'octahedral', atoms: [VS_UP, ...VS_SQUARE], lone: [VS_DOWN], tilt: -20, angles: [{ ideal: 90, squeezed: true, pairs: [[0, 1], [0, 2], [0, 3], [0, 4]] }, { ideal: 90, squeezed: false, pairs: vsRoundSquare(1) }], apexOdd: true },
  '6,0': { name: 'octahedral', geometry: 'octahedral', atoms: [VS_UP, VS_DOWN, ...VS_SQUARE], lone: [], tilt: -20, angles: [{ ideal: 90, squeezed: false, pairs: [...vsRoundSquare(2), ...[2, 3, 4, 5].flatMap(i => [[0, i], [1, i]])] }] },
};
const VS_PLANAR_RADICAL = { ...VS_SHAPES['3,0'], lone: [[0, 0, 1]] };
const VS_SUBS = '₀₁₂₃₄₅₆₇₈₉';
const vsSub = n => (n === 1 ? '' : [...String(n)].map(d => VS_SUBS[Number(d)]).join(''));
/** AX₃E for 3 atoms and 1 lone group. */
export const vsAxe = (x, e) => `AX${vsSub(x)}${e ? `E${vsSub(e)}` : ''}`;
/** Turns a direction round the up-down axis by yaw, then tips it by tilt round the x axis (degrees). */
function vsPlaced([x0, y, z0], spec) {
  const a = ((spec.yaw || 0) * Math.PI) / 180, x = x0 * Math.cos(a) + z0 * Math.sin(a), z = -x0 * Math.sin(a) + z0 * Math.cos(a), t = (spec.tilt * Math.PI) / 180;
  return [x, y * Math.cos(t) - z * Math.sin(t), y * Math.sin(t) + z * Math.cos(t)];
}
/**
 * The shape around a central atom: outer [{ el, order }], pairs (lone pairs on it), single (1 for a lone electron),
 * period (the central atom's), en(el) its electronegativity. -> { name, geometry, axe, x, e, atoms: [{ index, el, order,
 * dir }], lone: [{ electrons, dir }], angles } or null when VSEPR has no such shape.
 */
export function vsShape(outer, pairs, single, period, en) {
  const x = outer.length, e = pairs + single, planarRadical = x === 3 && pairs === 0 && single === 1 && period === 2;
  const spec = planarRadical ? VS_PLANAR_RADICAL : VS_SHAPES[`${x},${e}`];
  if (!spec) return null;
  const list = outer.map((o, i) => ({ ...o, index: i })), first = new Map();
  list.forEach((o, i) => { if (!first.has(o.el)) first.set(o.el, i); });
  const sorted = [...list].sort((p, q) => (spec.byEn && en(p.el) !== en(q.el) ? en(q.el) - en(p.el) : first.get(p.el) - first.get(q.el)));
  if (spec.apexOdd) {
    const count = o => list.filter(other => other.el === o.el).length;
    const apex = sorted.reduce((best, o) => (o.order > best.order || (o.order === best.order && count(o) < count(best)) ? o : best));
    sorted.splice(sorted.indexOf(apex), 1); sorted.unshift(apex);
  }
  const angles = single ? spec.angles.map(a => ({ ...a, squeezed: false })) : spec.angles;
  return { name: spec.name, geometry: spec.geometry, axe: vsAxe(x, e), x, e,
    atoms: sorted.map((o, i) => ({ index: o.index, el: o.el, order: o.order, dir: vsPlaced(spec.atoms[i], spec) })),
    lone: Array.from({ length: e }, (_, i) => ({ electrons: i < pairs ? 2 : 1, dir: vsPlaced(spec.lone[i], spec) })), angles };
}
/** A bond that leaves the page by more than this (the sine of its angle to the page) is a wedge or a dash. */
export const VS_OUT_OF_PAGE = 0.42;
/** Turns a direction by a view: round the page's up-down axis (yaw), then tipped (pitch), in degrees. */
export function vsTurn([x, y, z], yaw, pitch) {
  const a = (yaw * Math.PI) / 180, b = (pitch * Math.PI) / 180, x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a);
  return [x1, y * Math.cos(b) - z1 * Math.sin(b), y * Math.sin(b) + z1 * Math.cos(b)];
}
/** The page angles (radians) to draw lone pairs at: each the way it points as seen, pushed round until it is at least
 *  40 degrees from every bond and 60 from every other lone pair; one seen end on starts in the widest gap. */
export function vsFlatAngles(lone, bonds) {
  const GAP = (40 * Math.PI) / 180, PAIR_GAP = (60 * Math.PI) / 180, fixed = bonds.filter(b => Math.hypot(b[0], b[1]) > 0.15).map(b => Math.atan2(b[1], b[0]));
  const diff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const widest = () => {
    const all = [...fixed].sort((a, b) => a - b);
    if (!all.length) return -Math.PI / 2;
    let best = all[0] + Math.PI, size = -1;
    all.forEach((a, i) => { const next = i + 1 < all.length ? all[i + 1] : all[0] + 2 * Math.PI; if (next - a > size) { size = next - a; best = (a + next) / 2; } });
    return best;
  };
  const angles = lone.map((u, i) => (Math.hypot(u[0], u[1]) > 0.15 ? Math.atan2(u[1], u[0]) : widest() + i * PAIR_GAP));
  for (let round = 0; round < 60; round++) angles.forEach((a, i) => {
    let push = 0;
    for (const f of fixed) { const d = diff(a, f); if (Math.abs(d) < GAP) push += (d >= 0 ? 1 : -1) * (GAP - Math.abs(d)); }
    angles.forEach((o, j) => { if (j === i) return; const d = diff(a, o); if (Math.abs(d) < PAIR_GAP) push += (d > 0 || (d === 0 && i > j) ? 1 : -1) * ((PAIR_GAP - Math.abs(d)) / 2); });
    angles[i] = a + push * 0.5;
  });
  return angles;
}
const VS_CPK = { H: '#f4f4f4', He: '#d9ffff', Li: '#cc80ff', Be: '#c2ff00', B: '#ffb5b5', C: '#505050', N: '#3050f8', O: '#ff0d0d', F: '#90e050', Ne: '#b3e3f5', Al: '#bfa6a6', Si: '#f0c8a0', P: '#ff8000', S: '#ffd630', Cl: '#1ff01f', Ar: '#80d1e3', Ga: '#c28f8f', Ge: '#668f8f', As: '#bd80e3', Se: '#ffa100', Br: '#a62929', Kr: '#5cb8d1', In: '#a67573', Sn: '#668080', Sb: '#9e63b5', Te: '#d47a00', I: '#940094', Xe: '#429eb0' };
const VS_OTHER = '#c58cd8';
const vsChannels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const vsHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
/** How light a color looks, 0 to 1. */
export const vsLightness = hex => { const [r, g, b] = vsChannels(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const VS_GRAYS = { H: 0.97, C: 0.28, N: 0.5, O: 0.68, F: 0.86, Cl: 0.8, Br: 0.42, I: 0.36, S: 0.6, P: 0.55, B: 0.75, Xe: 0.46 };
/** An atom's color, or its gray. */
export function vsColor(el, gray) {
  const hex = VS_CPK[el] || VS_OTHER;
  if (!gray) return hex;
  const l = VS_GRAYS[el] ?? 0.35 + vsLightness(hex) * 0.5;
  return vsHex([l * 255, l * 255, l * 255]);
}
/** A color mixed toward white (amount > 0) or black (amount < 0). */
export const vsShade = (hex, amount) => vsHex(vsChannels(hex).map(v => (amount > 0 ? v + (255 - v) * amount : v * (1 + amount))));
