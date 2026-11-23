// Oomba Figures: a molecule's VSEPR shape in 3D (1.6.0, the chemistry pack). Wedge-and-dash (a bond toward the viewer
// a filled wedge, one away a hashed wedge) or ball-and-stick (shaded balls in the usual model-kit colors, sticks that
// narrow as they go back); the central atom's lone pairs as lobes or dots; its shape's name, electron geometry, AXE
// notation and bond angles (the ideal angle, with "<" where lone pairs squeeze it). The shapes (every count of atoms
// and lone groups VSEPR teaches, their directions, views and angle kinds), the view's turn, the lone pairs' page angles
// and the colors with their print grays are ported (ported/vsepr.js); the molecule table (each molecule's central atom,
// outer atoms, bond orders, lone pairs and charge, from its Lewis structure), the checks, the answers (OF.solve) and the
// drawing are Oomba's own. Grayscale and print give each element one gray of its own, set apart by hand.
import { node, label, line, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { chemWords } from './chemwords.js';
import { vsShape, VS_OUT_OF_PAGE, vsTurn, vsFlatAngles, vsColor, vsShade, vsLightness } from './ported/vsepr.js';

const VS_KEYS = ['kind', 'hide', 'molecule', 'central', 'outer', 'lone', 'single', 'charge', 'style', 'lonePairs', 'outerPairs', 'symbols', 'gray', 'yaw', 'pitch', 'name', 'geometry', 'axe', 'angles', 'heading'];
/** Pauling electronegativities (for which atoms go axial in a trigonal bipyramid). */
const VS_EN = { H: 2.2, Be: 1.57, B: 2.04, C: 2.55, N: 3.04, O: 3.44, F: 3.98, Si: 1.9, P: 2.19, S: 2.58, Cl: 3.16, As: 2.18, Se: 2.55, Br: 2.96, Kr: 3, Sb: 2.05, Te: 2.1, I: 2.66, Xe: 2.6 };
const VS_PERIOD = { H: 1, Be: 2, B: 2, C: 2, N: 2, O: 2, F: 2, Si: 3, P: 3, S: 3, Cl: 3, As: 4, Se: 4, Br: 4, Kr: 4, Sb: 5, Te: 5, I: 5, Xe: 5 };
const VS_VALENCE = { H: 1, Be: 2, B: 3, C: 4, N: 5, O: 6, F: 7, Si: 4, P: 5, S: 6, Cl: 7, As: 5, Se: 6, Br: 7, Kr: 8, Sb: 5, Te: 6, I: 7, Xe: 8 };
const a = (el, order = 1) => ({ el, order });
/** The molecules and ions: [central, outer atoms, lone pairs on the central atom, lone electron, charge]. The first 15
 *  come three to a shape (linear, bent, trigonal planar, trigonal pyramidal, tetrahedral), so a generator can deal one by
 *  its place in this list. */
export const VS_MOLECULES = {
  CO2: ['C', [a('O', 2), a('O', 2)], 0], BeCl2: ['Be', [a('Cl'), a('Cl')], 0], HCN: ['C', [a('H'), a('N', 3)], 0], H2O: ['O', [a('H'), a('H')], 2],
  SO2: ['S', [a('O', 2), a('O', 2)], 1], H2S: ['S', [a('H'), a('H')], 2], BF3: ['B', [a('F'), a('F'), a('F')], 0], SO3: ['S', [a('O', 2), a('O', 2), a('O', 2)], 0],
  HCHO: ['C', [a('O', 2), a('H'), a('H')], 0], NH3: ['N', [a('H'), a('H'), a('H')], 1], PH3: ['P', [a('H'), a('H'), a('H')], 1], NF3: ['N', [a('F'), a('F'), a('F')], 1],
  CH4: ['C', [a('H'), a('H'), a('H'), a('H')], 0], CCl4: ['C', [a('Cl'), a('Cl'), a('Cl'), a('Cl')], 0], SiH4: ['Si', [a('H'), a('H'), a('H'), a('H')], 0], BCl3: ['B', [a('Cl'), a('Cl'), a('Cl')], 0],
  NO3: ['N', [a('O', 2), a('O'), a('O')], 0, 0, -1], CO3: ['C', [a('O', 2), a('O'), a('O')], 0, 0, -2], O3: ['O', [a('O', 2), a('O')], 1], NO2: ['N', [a('O', 2), a('O')], 0, 1],
  CH3: ['C', [a('H'), a('H'), a('H')], 0, 1], CF4: ['C', [a('F'), a('F'), a('F'), a('F')], 0], CH3Cl: ['C', [a('Cl'), a('H'), a('H'), a('H')], 0], NH4: ['N', [a('H'), a('H'), a('H'), a('H')], 0, 0, 1],
  SO4: ['S', [a('O', 2), a('O', 2), a('O'), a('O')], 0, 0, -2], PO4: ['P', [a('O', 2), a('O'), a('O'), a('O')], 0, 0, -3], PCl3: ['P', [a('Cl'), a('Cl'), a('Cl')], 1], H3O: ['O', [a('H'), a('H'), a('H')], 1, 0, 1],
  ClO3: ['Cl', [a('O', 2), a('O', 2), a('O')], 1, 0, -1], OF2: ['O', [a('F'), a('F')], 2], SCl2: ['S', [a('Cl'), a('Cl')], 2], NH2: ['N', [a('H'), a('H')], 2, 0, -1],
  PCl5: ['P', [a('Cl'), a('Cl'), a('Cl'), a('Cl'), a('Cl')], 0], PF5: ['P', [a('F'), a('F'), a('F'), a('F'), a('F')], 0], AsF5: ['As', [a('F'), a('F'), a('F'), a('F'), a('F')], 0], SF4: ['S', [a('F'), a('F'), a('F'), a('F')], 1],
  SeF4: ['Se', [a('F'), a('F'), a('F'), a('F')], 1], ClF3: ['Cl', [a('F'), a('F'), a('F')], 2], BrF3: ['Br', [a('F'), a('F'), a('F')], 2], XeF2: ['Xe', [a('F'), a('F')], 3],
  I3: ['I', [a('I'), a('I')], 3, 0, -1], ICl2: ['I', [a('Cl'), a('Cl')], 3, 0, -1], SF6: ['S', [a('F'), a('F'), a('F'), a('F'), a('F'), a('F')], 0], BrF5: ['Br', [a('F'), a('F'), a('F'), a('F'), a('F')], 1],
  IF5: ['I', [a('F'), a('F'), a('F'), a('F'), a('F')], 1], XeOF4: ['Xe', [a('O', 2), a('F'), a('F'), a('F'), a('F')], 1], XeF4: ['Xe', [a('F'), a('F'), a('F'), a('F')], 2], ICl4: ['I', [a('Cl'), a('Cl'), a('Cl'), a('Cl')], 2, 0, -1],
};
const VS_SUB = '₀₁₂₃₄₅₆₇₈₉', VS_SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/** A molecule's formula as written: NH₄⁺, SO₄²⁻. */
const vsFormula = (id, charge) => id.replace(/(\d+)/g, m => [...m].map(c => VS_SUB[c]).join('')) + (charge ? `${Math.abs(charge) > 1 ? [...String(Math.abs(charge))].map(c => VS_SUP[c]).join('') : ''}${charge > 0 ? '⁺' : '⁻'}` : '');
/** The molecule as data: { central, outer: [{ el, order }], lone, single, charge, formula }. */
const VS_IDS = Object.keys(VS_MOLECULES);
const vsId = d => (typeof d.molecule === 'number' ? VS_IDS[d.molecule] : d.molecule);
function vsMolecule(d) {
  if (d.molecule !== undefined) { const id = vsId(d), m = VS_MOLECULES[id]; return { central: m[0], outer: m[1], lone: m[2], single: m[3] || 0, charge: m[4] || 0, formula: vsFormula(id, m[4] || 0) }; }
  const outer = d.outer.map(x => (typeof x === 'string' ? { el: x, order: 1 } : { el: x.el, order: x.order || 1 })), counts = {};
  outer.forEach(o => { counts[o.el] = (counts[o.el] || 0) + 1; });
  const formula = `${d.central}${Object.entries(counts).map(([el, n]) => `${el}${n > 1 ? n : ''}`).join('')}`;
  return { central: d.central, outer, lone: d.lone || 0, single: d.single || 0, charge: d.charge || 0, formula: vsFormula(formula, d.charge || 0) };
}
const vsShapeOf = m => vsShape(m.outer, m.lone, m.single, VS_PERIOD[m.central] || 3, el => VS_EN[el] ?? 2.5);
const vsAngleText = x => `${x.squeezed ? '<' : ''}${x.ideal}°`;

/**
 * { molecule: "NH3" (or its place in this list, from 0: CO2, BeCl2, HCN, H2O, SO2, H2S, BF3, SO3, HCHO, NH3, PH3, NF3,
 * CH4, CCl4, SiH4, BCl3, NO3 (NO₃⁻), CO3, O3, NO2 (a radical), CH3 (a radical), CF4, CH3Cl, NH4, SO4, PO4, PCl3, H3O,
 * ClO3, OF2, SCl2, NH2, PCl5, PF5, AsF5, SF4, SeF4, ClF3, BrF3, XeF2, I3, ICl2, SF6, BrF5, IF5, XeOF4, XeF4, ICl4), or your own
 * { central: "Xe", outer: ["F", { el: "O", order: 2 }], lone: lone pairs on the central atom, single: 1 for a lone
 * electron, charge }; style: "wedge" | "ball", lonePairs: "lobes" | "dots" | "none", outerPairs: false (the outer atoms'
 * lone pairs as dots), symbols: true, gray: false (one gray per element), yaw, pitch (turn the view, degrees), name:
 * true (the shape's name under it), geometry: false (the electron geometry), axe: false (AXE notation), angles: false
 * (the bond angles), heading }. hide: "name" (every line under it left blank for the student), "angles", true (both).
 */
export const vsepr = {
  check(d) {
    const odd = Object.keys(d).filter(k => !VS_KEYS.includes(k));
    if (odd.length) return [`a VSEPR shape does not take "${odd[0]}"`];
    if (d.molecule !== undefined) {
      if (!VS_MOLECULES[vsId(d)]) return [`"molecule" is one of ${Object.keys(VS_MOLECULES).join(', ')} (or give "central", "outer" and "lone")`];
      if (['central', 'outer', 'lone', 'single', 'charge'].some(k => d[k] !== undefined)) return ['give "molecule" or your own "central", "outer" and "lone", not both'];
    } else {
      if (!VS_EN[d.central] || d.central === 'H') return [`"central" is the central atom: ${Object.keys(VS_EN).filter(e => e !== 'H').join(', ')}`];
      if (!Array.isArray(d.outer) || d.outer.length < 1 || d.outer.length > 6) return ['"outer" lists the 1 to 6 atoms bonded to the central atom'];
      for (const [i, x] of d.outer.entries()) {
        const el = typeof x === 'string' ? x : x && x.el, order = typeof x === 'string' ? 1 : x && (x.order ?? 1);
        if (!VS_EN[el] || ![1, 2, 3].includes(order)) return [`outer atom ${i + 1} is an element symbol, or { el, order: 1, 2 or 3 }`];
        if (el === 'H' && order !== 1) return [`outer atom ${i + 1}: hydrogen makes one single bond`];
      }
      if (d.lone !== undefined && !(Number.isInteger(d.lone) && d.lone >= 0 && d.lone <= 3)) return ['"lone" is the central atom\'s lone pairs, 0 to 3'];
      if (d.single !== undefined && ![0, 1].includes(d.single)) return ['"single" is 1 for a lone electron on the central atom, else 0'];
      if (d.charge !== undefined && !(Number.isInteger(d.charge) && Math.abs(d.charge) <= 3)) return ['"charge" is a whole number, −3 to 3'];
      const m = vsMolecule(d), bonds = m.outer.reduce((s, o) => s + o.order, 0), used = bonds + 2 * m.lone + m.single, have = VS_VALENCE[m.central] - m.charge;
      if (used !== have) return [`${m.central} would use ${used} electrons (${bonds} in bonds, ${2 * m.lone + m.single} unshared), but it brings ${have} (its valence electrons${m.charge ? ', less the charge' : ''}): change "lone" or the bond orders`];
      if (VS_PERIOD[m.central] === 2 && bonds + 2 * m.lone + m.single > 8) return [`${m.central} is in period 2, so it holds at most 8 electrons`];
      for (const o of m.outer) if (o.el !== 'H' && o.order * 2 > 8) return [`${o.el} cannot make that many bonds`];
      if (!vsShapeOf(m)) return [`${m.outer.length} atoms and ${m.lone + m.single} lone groups around the central atom is not a VSEPR shape drawn here`];
    }
    const out = [];
    if (d.style !== undefined && !['wedge', 'ball'].includes(d.style)) out.push('"style" must be "wedge" or "ball"');
    if (d.lonePairs !== undefined && !['lobes', 'dots', 'none'].includes(d.lonePairs)) out.push('"lonePairs" must be "lobes", "dots" or "none"');
    for (const k of ['outerPairs', 'symbols', 'gray', 'name', 'geometry', 'axe', 'angles']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
    if (d.yaw !== undefined && !isNum(d.yaw, -180, 180)) out.push('"yaw" turns the view round the up-down axis: −180 to 180 degrees');
    if (d.pitch !== undefined && !isNum(d.pitch, -90, 90)) out.push('"pitch" tips the view: −90 to 90 degrees');
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short title');
    return out;
  },
  /** shape (its name: "trigonal pyramidal"), geometry (the electron geometry), axe ("AX₃E"), atoms (bonded to the central
   *  atom), lonePairs (lone groups on it), groups (atoms + lone groups), angle (the first kind of bond angle's ideal, in
   *  degrees; none for one atom), angles.<n>, squeezed (1 when lone pairs make the angle less than ideal), central. */
  solve(d) {
    if (vsepr.check(d).length) return null;
    const m = vsMolecule(d), s = vsShapeOf(m), angles = {};
    s.angles.forEach((x, i) => { angles[i + 1] = x.ideal; });
    return { shape: s.name, geometry: s.geometry, axe: s.axe, atoms: s.x, lonePairs: s.e, groups: s.x + s.e, angle: s.angles.length ? s.angles[0].ideal : null, angles,
      squeezed: s.angles.some(x => x.squeezed) ? 1 : 0, central: m.central, formula: m.formula };
  },
  draw(d, o) {
    const P = palette(o), W = chemWords(o.lang), m = vsMolecule(d), s = vsShapeOf(m), ball = d.style === 'ball', gray = o.print || d.gray === true;
    const yaw = d.yaw || 0, pitch = d.pitch || 0, view = v => vsTurn(v, yaw, pitch), B = ball ? 96 : 82, R0 = ball ? (VS_PERIOD[m.central] <= 2 ? 22 : 26) : 18;
    const rOf = el => (!ball ? 17 : el === 'H' ? 14 : VS_PERIOD[el] <= 2 ? 20 : 24), persp = ball ? 1 / 380 : 0;
    const blankName = o.hide === true || hides(o, 'name'), blankAngle = o.hide === true || hides(o, 'angles');
    const pieces = [], dirs = s.atoms.map(x => view(x.dir)), lones = s.lone.map(x => ({ ...x, dir: view(x.dir) }));
    // where each outer atom sits on the page: wedge-and-dash keeps an out-of-page bond nearly full length
    const place = v => {
      const k = 1 + v[2] * B * persp, flat = Math.hypot(v[0], v[1]);
      if (!ball && flat > 0.05) { const len = Math.max(flat, 0.82); return [(v[0] / flat) * len * B, (v[1] / flat) * len * B]; }
      return [v[0] * B * k, v[1] * B * k];
    };
    const pos = dirs.map(place);
    pieces.push({ z: 0, kind: 'atom', x: 0, y: 0, el: m.central, r: R0, central: true });
    s.atoms.forEach((at, i) => {
      const [x, y] = pos[i], z = dirs[i][2], depth = z > VS_OUT_OF_PAGE ? 'wedge' : z < -VS_OUT_OF_PAGE ? 'dash' : 'plane';
      pieces.push({ z: z / 2 - 0.001, kind: 'bond', x, y, depth, order: at.order, near: z }, { z, kind: 'atom', x, y, el: at.el, r: rOf(at.el) * (1 + z * B * persp), order: at.order });
    });
    // the central atom's lone pairs: lobes (balloons pointed at it) or dots, at page angles clear of the bonds
    const flat = vsFlatAngles(lones.map(l => l.dir), dirs), lpMode = d.lonePairs || 'lobes';
    if (lpMode !== 'none') lones.forEach((l, i) => pieces.push({ z: Math.max(-0.2, Math.min(0.2, l.dir[2])) + 0.0005, kind: lpMode === 'lobes' ? 'lobe' : 'dots', angle: flat[i], electrons: l.electrons }));
    pieces.sort((p, q) => p.z - q.z);
    const kids = [], ink = P.ink, fillOf = el => vsColor(el, gray), box = { x0: -R0, x1: R0, y0: -R0, y1: R0 };
    const grow = (x, y, r = 0) => { box.x0 = Math.min(box.x0, x - r); box.x1 = Math.max(box.x1, x + r); box.y0 = Math.min(box.y0, y - r); box.y1 = Math.max(box.y1, y + r); };
    for (const p of pieces) {
      if (p.kind === 'bond') {
        const len = Math.hypot(p.x, p.y) || 1, ux = p.x / len, uy = p.y / len, nx = -uy, ny = ux, s0 = R0 * 0.6, x0 = ux * s0, y0 = uy * s0;
        if (ball) {
          const w0 = 9, w1 = 9 * (1 + p.near * B * persp), stick = gray ? '#9A9A9A' : '#B8B8B8';
          kids.push(node('polygon', { points: [[x0 + nx * w0 / 2, y0 + ny * w0 / 2], [p.x + nx * w1 / 2, p.y + ny * w1 / 2], [p.x - nx * w1 / 2, p.y - ny * w1 / 2], [x0 - nx * w0 / 2, y0 - ny * w0 / 2]].map(q => `${r2(q[0])},${r2(q[1])}`).join(' '), fill: p.near < -0.3 ? vsShade(stick, -0.2) : stick, stroke: ink, 'stroke-width': 1.2, class: 'of-bond' }));
        } else if (p.depth === 'wedge') {
          const w = 12;
          kids.push(node('polygon', { points: `${r2(x0)},${r2(y0)} ${r2(p.x - ux * 15 + nx * w / 2)},${r2(p.y - uy * 15 + ny * w / 2)} ${r2(p.x - ux * 15 - nx * w / 2)},${r2(p.y - uy * 15 - ny * w / 2)}`, fill: ink, class: 'of-bond of-wedge' }));
        } else if (p.depth === 'dash') {
          const n = 7, end = len - 17;
          for (let k = 1; k <= n; k++) { const t = s0 + ((end - s0) * k) / n, hw = 1 + (5 * k) / n; kids.push(line(r2(ux * t + nx * hw), r2(uy * t + ny * hw), r2(ux * t - nx * hw), r2(uy * t - ny * hw), ink, 2.2, { class: 'of-bond of-dash' })); }
        } else {
          const offs = p.order === 1 ? [0] : p.order === 2 ? [-3.5, 3.5] : [-5, 0, 5];
          for (const off of offs) kids.push(line(r2(x0 + nx * off), r2(y0 + ny * off), r2(p.x - ux * 15 + nx * off), r2(p.y - uy * 15 + ny * off), ink, 3, { class: 'of-bond' }));
        }
      } else if (p.kind === 'atom') {
        grow(p.x, p.y, p.r);
        const show = d.symbols !== false;
        if (ball) {
          const f = fillOf(p.el), dark = vsLightness(f) < 0.5;
          kids.push(node('circle', { cx: r2(p.x), cy: r2(p.y), r: r2(p.r), fill: f, stroke: ink, 'stroke-width': 1.6, class: `of-atom of-${p.el}` }),
            node('circle', { cx: r2(p.x - p.r * 0.35), cy: r2(p.y - p.r * 0.35), r: r2(p.r * 0.32), fill: '#FFFFFF', opacity: 0.45 }));
          if (show) kids.push(label(r2(p.x), r2(p.y + 1), p.el, { anchor: 'middle', size: p.r > 18 ? 16 : 13, colour: dark ? '#FFFFFF' : '#141414', cls: 'of-symbol' }));
        } else {
          kids.push(node('circle', { cx: r2(p.x), cy: r2(p.y), r: p.r, fill: P.paper, stroke: ink, 'stroke-width': 2.2, class: `of-atom of-${p.el}` }));
          if (show) kids.push(label(r2(p.x), r2(p.y + 1), p.el, { anchor: 'middle', size: 18, weight: 600, colour: ink, cls: 'of-symbol' }));
        }
        // the outer atoms' own lone pairs, as dots facing away from the bond
        if (!p.central && d.outerPairs && p.el !== 'H') {
          const pairs = (8 - 2 * p.order) / 2, out = Math.atan2(p.y, p.x), spread = pairs === 3 ? [-Math.PI / 2, 0, Math.PI / 2] : pairs === 2 ? [-Math.PI / 3, Math.PI / 3] : pairs === 1 ? [0] : [];
          for (const t of spread) {
            const ang = out + t, cx = p.x + Math.cos(ang) * (p.r + 7), cy = p.y + Math.sin(ang) * (p.r + 7);
            for (const side of [-1, 1]) kids.push(node('circle', { cx: r2(cx - Math.sin(ang) * side * 3.6), cy: r2(cy + Math.cos(ang) * side * 3.6), r: 2.4, fill: ink, class: 'of-outer-pair' }));
            grow(cx, cy, 6);
          }
        }
      } else {
        const ux = Math.cos(p.angle), uy = Math.sin(p.angle), nx = -uy, ny = ux;
        if (p.kind === 'lobe') {
          const tip = R0 - 2, L = 58, w = 19, cx = ux * (tip + L - w), cy = uy * (tip + L - w);
          const tx = ux * tip, ty = uy * tip, e1 = [cx - nx * w, cy - ny * w], e2 = [cx + nx * w, cy + ny * w];
          const dpath = `M ${r2(tx)} ${r2(ty)} Q ${r2(e2[0] - ux * w * 0.9)} ${r2(e2[1] - uy * w * 0.9)} ${r2(e2[0])} ${r2(e2[1])} A ${w} ${w} 0 0 0 ${r2(e1[0])} ${r2(e1[1])} Q ${r2(e1[0] - ux * w * 0.9)} ${r2(e1[1] - uy * w * 0.9)} ${r2(tx)} ${r2(ty)} Z`;
          kids.push(node('path', { d: dpath, fill: ball ? (gray ? '#EDEDED' : '#EAF2FB') : P.paper, stroke: ink, 'stroke-width': 1.8, 'fill-opacity': ball ? 0.85 : 1, class: 'of-lobe' }));
          const dx = cx + ux * 3, dy = cy + uy * 3;
          if (p.electrons === 2) for (const side of [-1, 1]) kids.push(node('circle', { cx: r2(dx + nx * side * 5.5), cy: r2(dy + ny * side * 5.5), r: 3.4, fill: ink, class: 'of-lone' }));
          else kids.push(node('circle', { cx: r2(dx), cy: r2(dy), r: 3.4, fill: ink, class: 'of-lone' }));
          grow(cx, cy, w + 2); grow(ux * (tip + L), uy * (tip + L), 2);
        } else {
          const dx = ux * (R0 + 9), dy = uy * (R0 + 9);
          if (p.electrons === 2) for (const side of [-1, 1]) kids.push(node('circle', { cx: r2(dx + nx * side * 4), cy: r2(dy + ny * side * 4), r: 2.8, fill: ink, class: 'of-lone' }));
          else kids.push(node('circle', { cx: r2(dx), cy: r2(dy), r: 2.8, fill: ink, class: 'of-lone' }));
          grow(dx, dy, 8);
        }
      }
    }
    // the bond angles: an arc between one pair of each kind, its label at the arc's middle
    // (of each kind, the pair that looks most like its angle on the page; the label moves out until it is clear of atoms)
    const taken = [];
    if (d.angles && s.angles.length) s.angles.forEach((k, i) => {
      const seen = ([q1, q2]) => { const u = pos[q1], v = pos[q2], c = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1); return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI; };
      const [p1, p2] = [...k.pairs].filter(pr => !taken.some(t => t[0] === pr[0] && t[1] === pr[1])).sort((x, y) => Math.abs(seen(x) - k.ideal) - Math.abs(seen(y) - k.ideal))[0] || k.pairs[0];
      taken.push([p1, p2]);
      const a1 = Math.atan2(pos[p1][1], pos[p1][0]), a2 = Math.atan2(pos[p2][1], pos[p2][0]);
      let da = Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1));
      if (Math.abs(Math.abs(da) - Math.PI) < 0.05) da = Math.PI;
      const r = R0 + 14 + i * 12, mid = a1 + da / 2, x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r, x2 = Math.cos(a1 + da) * r, y2 = Math.sin(a1 + da) * r;
      kids.push(node('path', { d: `M ${r2(x1)} ${r2(y1)} A ${r} ${r} 0 0 ${da > 0 ? 1 : 0} ${r2(x2)} ${r2(y2)}`, fill: 'none', stroke: P.red, 'stroke-width': 1.6, class: 'of-angle' }));
      const atomsAt = [[0, 0, R0], ...pos.map((q, j) => [q[0], q[1], rOf(s.atoms[j].el)])];
      let rr = r + 20;
      while (rr < r + 90 && atomsAt.some(([ax, ay, ar]) => Math.hypot(Math.cos(mid) * rr - ax, Math.sin(mid) * rr - ay) < ar + 22)) rr += 4;
      const lx = Math.cos(mid) * rr, ly = Math.sin(mid) * rr;
      kids.push(label(r2(lx), r2(ly), blankAngle ? '____' : vsAngleText(k), { anchor: 'middle', size: 15, colour: P.red, halo: P.paper, cls: blankAngle ? 'of-blank' : 'of-angle-text' }));
      grow(lx, ly, 26);
    });
    // brackets and the charge for an ion
    if (m.charge) {
      const bx0 = box.x0 - 8, bx1 = box.x1 + 8, by0 = box.y0 - 6, by1 = box.y1 + 6;
      kids.push(node('path', { d: `M ${r2(bx0 + 8)} ${r2(by0)} H ${r2(bx0)} V ${r2(by1)} H ${r2(bx0 + 8)} M ${r2(bx1 - 8)} ${r2(by0)} H ${r2(bx1)} V ${r2(by1)} H ${r2(bx1 - 8)}`, fill: 'none', stroke: ink, 'stroke-width': 2, class: 'of-brackets' }),
        label(r2(bx1 + 4), r2(by0 + 6), `${Math.abs(m.charge) > 1 ? Math.abs(m.charge) : ''}${m.charge > 0 ? '+' : '−'}`, { size: 16, colour: ink, cls: 'of-charge' }));
      grow(bx0, by0, 2); grow(bx1 + 22, by1, 2);
    }
    // the lines under it: the shape's name, the electron geometry, AXE notation
    const under = [];
    if (d.name !== false) under.push(['shapeLabel', W(`vs_${s.name}`)]);
    if (d.geometry) under.push(['geometryLabel', W(`vs_${s.geometry}`)]);
    if (d.axe) under.push(['axeLabel', s.axe]);
    const pad = 22, top = d.heading ? 34 : 14, w = Math.max(box.x1 - box.x0 + 2 * pad, ...under.map(([k, v]) => (W(k).length + v.length + 2) * 9.5 + 2 * pad), 220);
    const dx = w / 2 - (box.x0 + box.x1) / 2, dy = top + pad - box.y0, hFig = box.y1 - box.y0 + 2 * pad;
    const all = [node('g', { transform: `translate(${r2(dx)} ${r2(dy)})` }, kids)];
    under.forEach(([k, v], i) => all.push(label(r2(w / 2), r2(top + hFig + 14 + i * 26), `${W(k)}: ${blankName ? '______________' : v}`, { anchor: 'middle', size: 17, colour: ink, cls: blankName ? 'of-blank' : 'of-under' })));
    if (d.heading) all.push(label(r2(w / 2), 18, text(d.heading, 60), { anchor: 'middle', size: 14, colour: ink }));
    return frame(w, top + hFig + under.length * 26 + 14, all, { ...o, kind: 'vsepr' }, o.title || `${W('vseprShape')}: ${m.formula}`);
  },
};
