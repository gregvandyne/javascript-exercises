// Oomba Figures: nuclide notation (1.2.0, the chemistry pack). An isotope, an ion or a nuclear particle as it is
// written: the mass number at the top left and the atomic number at the bottom left, both right-aligned against the
// symbol, the charge at the top right; or in hyphen notation (C-14). The numbers come from the data and must make a
// nuclide: never fewer than 0 neutrons or electrons. The elements are all 118 (ported/elements.js); the checks, the
// answers and the typesetting are Oomba's own.
import { node, label, line, frame, palette, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { EL_SYMBOLS, EL_MAX_Z, elZ } from './ported/elements.js';
import { MOLECULES, ELEMENTS, zOf, lewis } from './chem.js';

/** The nuclear particles: mass number, the bottom number (its charge for a beta particle or positron), its symbols. */
export const NU_PARTICLES = {
  alpha: { mass: 4, z: '2', symbols: ['He', 'α'] }, beta: { mass: 0, z: '−1', symbols: ['e', 'β'] }, positron: { mass: 0, z: '+1', symbols: ['e', 'β'] },
  neutron: { mass: 1, z: '0', symbols: ['n'] }, proton: { mass: 1, z: '1', symbols: ['p', 'H'] }, gamma: { mass: 0, z: '0', symbols: ['γ'] },
};
const NU_KEYS = ['kind', 'hide', 'element', 'Z', 'mass', 'charge', 'particle', 'symbol', 'notation', 'heading'];
const nuCharge = q => (q === 0 ? '' : `${Math.abs(q) === 1 ? '' : Math.abs(q)}${q > 0 ? '+' : '−'}`);
/** { symbol, Z, mass, charge, zText, particle } from the data. */
function nuOf(d) {
  if (d.particle !== undefined) { const p = NU_PARTICLES[d.particle]; return { symbol: d.symbol || p.symbols[0], mass: p.mass, zText: p.z, Z: Number(p.z.replace('−', '-')), charge: 0, particle: d.particle }; }
  const Z = d.element !== undefined ? elZ(d.element) : d.Z;
  return { symbol: d.element !== undefined ? EL_SYMBOLS[Z] : text(d.symbol, 3), Z, zText: String(Z), mass: d.mass, charge: d.charge || 0 };
}
/**
 * { element: "C" | 6 (any of the 118), mass: 14, charge?: 0 (an ion: −1 for Cl⁻) } or your own symbol { symbol: "X",
 * Z, mass, charge? } or a nuclear particle { particle: "alpha" | "beta" | "positron" | "neutron" | "proton" | "gamma",
 * symbol?: "He" or "α" (an alpha particle), "e" or "β" (beta, positron), "p" or "H" (a proton) }; notation?: "symbol"
 * | "hyphen" (C-14) | "both". hide: "mass", "Z", "symbol", "charge" (a box to fill), true (mass and Z).
 */
export const nuclide = {
  check(d) {
    const odd = Object.keys(d).filter(k => !NU_KEYS.includes(k));
    if (odd.length) return [`nuclide notation does not take "${odd[0]}"`];
    const out = [];
    if (d.notation !== undefined && !['symbol', 'hyphen', 'both'].includes(d.notation)) out.push('"notation" must be "symbol", "hyphen" or "both"');
    if (d.particle !== undefined) {
      if (!Object.prototype.hasOwnProperty.call(NU_PARTICLES, d.particle)) return [`"particle" must be one of ${Object.keys(NU_PARTICLES).join(', ')}`];
      if (['element', 'Z', 'mass', 'charge'].some(k => d[k] !== undefined)) out.push('a particle\'s numbers are fixed: leave out element, Z, mass and charge');
      if (d.symbol !== undefined && !NU_PARTICLES[d.particle].symbols.includes(d.symbol)) out.push(`a ${d.particle} particle is written ${NU_PARTICLES[d.particle].symbols.join(' or ')}`);
      if (d.notation && d.notation !== 'symbol') out.push('a particle has no hyphen notation');
      return out;
    }
    if (d.element !== undefined) {
      if (!elZ(d.element)) return [`"element" must be a symbol from H to Og (or its atomic number, 1 to ${EL_MAX_Z})`];
      if (d.Z !== undefined || d.symbol !== undefined) out.push('give "element", or your own "symbol" and "Z", not both');
    } else {
      if (!text(d.symbol, 3) || !/^[A-Z][a-z]{0,2}$/.test(String(d.symbol))) return ['give "element" (a symbol), or your own "symbol" (like "X") with "Z"'];
      if (!(Number.isInteger(d.Z) && d.Z >= 0 && d.Z <= 300)) out.push('"Z" (the atomic number) must be a whole number from 0 to 300');
    }
    if (out.length) return out;
    const n = nuOf(d);
    if (!(Number.isInteger(n.mass) && n.mass >= 1 && n.mass <= 300)) out.push('"mass" (the mass number) must be a whole number from 1 to 300');
    else if (n.mass < n.Z) out.push(`the mass number (${n.mass}) is below the atomic number (${n.Z}): that would be fewer than 0 neutrons`);
    if (d.charge !== undefined && !(Number.isInteger(d.charge) && d.charge >= -8 && d.charge <= 8)) out.push('"charge" must be a whole number from −8 to 8');
    else if (n.charge > n.Z) out.push(`a charge above the atomic number (${n.Z}) would be fewer than 0 electrons`);
    return out;
  },
  /** The protons, neutrons and electrons (for an element or your own symbol); a particle's numbers. */
  solve(d) {
    if (nuclide.check(d).length) return null;
    const n = nuOf(d);
    if (n.particle) return { particle: n.particle, symbol: n.symbol, mass: n.mass, Z: n.Z };
    return { symbol: n.symbol, Z: n.Z, mass: n.mass, charge: n.charge, protons: n.Z, neutrons: n.mass - n.Z, electrons: n.Z - n.charge };
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), n = nuOf(d), notation = d.notation || 'symbol', kids = [];
    const blank = part => (o.hide === true && (part === 'mass' || part === 'Z')) || hides(o, part);
    const box = (x, y, w, h, anchor) => node('rect', { x: r2(anchor === 'end' ? x - w : x), y: r2(y - h / 2), width: w, height: h, rx: 3, fill: 'none', stroke: P.ink, 'stroke-width': 1.8, class: 'of-blank' });
    const S = 80, sw = Math.max(0.5, [...n.symbol].reduce((t, ch) => t + (/[iljtfr]/.test(ch) ? 0.3 : /[A-Z]/.test(ch) ? 0.7 : 0.56), 0)) * S, small = 34, nums = Math.max(String(n.mass).length, n.zText.length) * small * 0.6;
    const x0 = 30 + Math.max(nums, 50) + 8, base = 40 + S * 0.8, H = notation === 'hyphen' ? 110 : notation === 'both' ? base + 90 : base + 44;
    if (notation !== 'hyphen') {
      kids.push(blank('symbol') ? box(x0, base - S * 0.36, sw, S * 0.78) : label(x0, base - S * 0.36, n.symbol, { size: S, weight: 500, colour: P.ink, cls: 'of-symbol' }));
      kids.push(blank('mass') ? box(x0 - 6, base - S * 0.72, 50, 36, 'end') : label(x0 - 4, base - S * 0.72, String(n.mass), { anchor: 'end', size: small, weight: 600, colour: P.ink, cls: 'of-mass' }));
      kids.push(blank('Z') ? box(x0 - 6, base + 4, 50, 36, 'end') : label(x0 - 4, base + 4, n.zText, { anchor: 'end', size: small, weight: 600, colour: P.ink, cls: 'of-z' }));
      if (n.charge || hides(o, 'charge')) kids.push(blank('charge') ? box(x0 + sw + 6, base - S * 0.72, 46, 36) : label(x0 + sw + 4, base - S * 0.72, nuCharge(n.charge), { size: small, weight: 600, colour: P.ink, cls: 'of-charge' }));
    }
    if (notation !== 'symbol') {
      const y = notation === 'hyphen' ? 56 : base + 58;
      kids.push(label(x0 + sw / 2, y, `${blank('symbol') ? '____' : n.symbol}-${blank('mass') ? '____' : n.mass}`, { anchor: notation === 'hyphen' ? 'middle' : 'middle', size: 30, weight: 600, colour: P.ink, cls: 'of-hyphen' }));
    }
    const Wd = x0 + sw + (n.charge || hides(o, 'charge') ? 70 : 30);
    return frame(Wd, H, kids, { ...o, kind: 'nuclide' }, o.title || W('nuclide'));
  },
};

// ---------------------------------------------------------------- dot-and-cross diagrams (1.2.0)
// A molecule's outer shells as circles that overlap where atoms bond, each shared pair in the overlap (one electron
// from each atom), each atom's own electrons in its own mark (dots, crosses, rings); or an ionic compound's ions side
// by side in brackets, the electrons the metal gave as crosses in the non-metal's full outer shell. Not the same figure
// as `lewis` (lines and dots, no shells) or `bohr` (one atom, every shell): electrons are counted from the element
// table, and data that breaks the rules is refused.
const DC_KEYS = ['kind', 'hide', 'molecule', 'atoms', 'bonds', 'ions', 'heading'];
const DC_MARKS = ['dot', 'cross', 'ring'];
const dcMol = d => (typeof d.molecule === 'string' ? MOLECULES[d.molecule] : d);
/** Each atom's mark: by element (dot, cross, ring), or alternating when the molecule is one element. */
function dcMarks(m) {
  const els = [...new Set(m.atoms.map(a => a.el))];
  return m.atoms.map((a, i) => (els.length === 1 ? DC_MARKS[i % 2] : DC_MARKS[els.indexOf(a.el)]));
}
/** An ionic compound's ions: { symbol, Z, charge, count, metal, shell (electrons in the drawn outer shell) }. */
function dcIons(d) {
  return d.ions.map(i => {
    const Z = zOf(i.element), v = ELEMENTS[Z][2], metal = v <= 3 && Z > 2, charge = metal ? v : -(8 - v);
    return { symbol: ELEMENTS[Z][0], Z, charge, count: i.count ?? 1, metal, own: metal ? (Z - v <= 2 ? Z - v : 8) : v, gained: metal ? 0 : 8 - v };
  });
}
/**
 * A molecule { molecule: "H2O" } (the Lewis structures' ready ones without a charge, or your own atoms and bonds as for
 * `lewis`), or an ionic compound { ions: [{ element: "Mg", count: 1 }, { element: "Cl", count: 2 }] } (a metal from
 * groups 1 to 3 and a non-metal from groups 15 to 17: their charges must balance). hide: true (the shells empty, for
 * the student to fill).
 */
export const dotCross = {
  check(d) {
    const odd = Object.keys(d).filter(k => !DC_KEYS.includes(k));
    if (odd.length) return [`a dot-and-cross diagram does not take "${odd[0]}"`];
    if (d.ions !== undefined) {
      if (d.molecule !== undefined || d.atoms !== undefined) return ['give a "molecule" or "ions", not both'];
      const I = d.ions;
      if (!Array.isArray(I) || I.length !== 2 || I.some(i => !i || !zOf(i.element) || (i.count !== undefined && !(Number.isInteger(i.count) && i.count >= 1 && i.count <= 3)))) return ['"ions" lists a metal and a non-metal: [{ element, count }, { element, count }] (H to Kr, count 1 to 3)'];
      const ions = dcIons(d), out = [];
      const metal = ions.filter(i => i.metal), non = ions.filter(i => !i.metal && i.Z > 2 && ELEMENTS[i.Z][2] >= 5);
      if (metal.length !== 1 || non.length !== 1) return ['an ionic compound here is one metal (groups 1 to 3) and one non-metal (groups 15 to 17)'];
      const total = ions.reduce((s, i) => s + i.charge * i.count, 0);
      if (total !== 0) out.push(`the charges do not balance: ${ions.map(i => `${i.count} × ${i.charge > 0 ? '+' : '−'}${Math.abs(i.charge)}`).join(' and ')} is ${total > 0 ? '+' : '−'}${Math.abs(total)} (change the counts)`);
      return out;
    }
    const m = dcMol(d);
    if (typeof d.molecule === 'string' && !m) return [`unknown "molecule" (ready ones: ${Object.keys(MOLECULES).filter(k => !MOLECULES[k].charge).join(', ')}); or give "atoms" and "bonds"`];
    if (m.charge) return ['a charged molecule is not drawn as dot-and-cross yet (use "lewis")'];
    const bad = lewis.check(m);
    if (bad.length) return bad;
    // every electron must come from its own atom: its lone pairs and one per bond order are its valence electrons
    const out = [];
    m.atoms.forEach((a, i) => {
      const own = 2 * (a.lone || 0) + m.bonds.filter(b => b.a === i || b.b === i).reduce((s, b) => s + (b.order ?? 1), 0), v = ELEMENTS[zOf(a.el)][2];
      if (own !== v) out.push(`atom ${i + 1} (${a.el}) would show ${own} of its own electrons but has ${v}: a dative bond is not drawn as dot-and-cross yet`);
    });
    return out;
  },
  /** A molecule's bonds, shared pairs and lone pairs; an ionic compound's ions, charges and the electrons moved. */
  solve(d) {
    if (dotCross.check(d).length) return null;
    if (d.ions) {
      const ions = dcIons(d), metal = ions.find(i => i.metal);
      return { ionic: true, ions: ions.map(i => ({ symbol: i.symbol, charge: i.charge, count: i.count })), transferred: metal.charge * metal.count, formula: ions.map(i => `${i.symbol}${i.count > 1 ? i.count : ''}`).join('') };
    }
    const m = dcMol(d), shared = m.bonds.reduce((s, b) => s + (b.order ?? 1), 0), lone = m.atoms.reduce((s, a) => s + (a.lone || 0), 0);
    return { ionic: false, bonds: m.bonds.length, sharedPairs: shared, lonePairs: lone, electrons: 2 * (shared + lone) };
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), empty = o.hide === true, kids = [];
    const mark = (kind, x, y, colour) => (kind === 'cross' ? node('g', { class: 'of-cross' }, line(x - 4.5, y - 4.5, x + 4.5, y + 4.5, colour, 2.2), line(x - 4.5, y + 4.5, x + 4.5, y - 4.5, colour, 2.2))
      : kind === 'ring' ? node('circle', { cx: r2(x), cy: r2(y), r: 4, fill: 'none', stroke: colour, 'stroke-width': 1.8, class: 'of-ring' }) : node('circle', { cx: r2(x), cy: r2(y), r: 3.8, fill: colour, class: 'of-dot' }));
    const C = [P.blue, P.red, P.green];
    if (d.ions) {
      const ions = dcIons(d), row = [], R = 46;
      const metal = ions.find(i => i.metal), non = ions.find(i => !i.metal);
      // the row: anions either side of the cation(s), as a compound is usually drawn
      const list = [...Array(Math.ceil(non.count / 2)).fill(non), ...Array(metal.count).fill(metal), ...Array(Math.floor(non.count / 2)).fill(non)];
      let x = 16;
      for (const ion of list) {
        const cx = x + 22 + R, cy = 30 + R, n = ion.own + ion.gained;
        row.push(node('circle', { cx, cy, r: R, fill: 'none', stroke: P.gridStrong, 'stroke-width': 2 }), label(cx, cy + 1, ion.symbol, { anchor: 'middle', size: 22, weight: 800, colour: P.ink }));
        if (!empty) for (let k = 0; k < n; k++) {
          const a = -Math.PI / 2 + Math.floor(k / 2) * (Math.PI / 2) + (n > 2 ? (k % 2 ? 0.22 : -0.22) : (k % 2 ? Math.PI : 0)), px = cx + R * Math.cos(a), py = cy + R * Math.sin(a);
          const theirs = ion.metal || k >= ion.own; row.push(mark(theirs ? 'cross' : 'dot', px, py, theirs ? C[1] : C[0]));
        }
        row.push(label(x + 6, cy, '[', { size: 64, weight: 300, colour: P.ink }), label(cx + R + 8, cy, ']', { size: 64, weight: 300, colour: P.ink }),
          label(cx + R + 26, cy - R + 4, nuCharge(ion.charge), { size: 18, colour: P.ink }));
        x = cx + R + 50;
      }
      kids.push(...row);
      return frame(x, 30 + 2 * R + 40, kids, { ...o, kind: 'dotCross' }, o.title || W('dotCross'));
    }
    const m = dcMol(d), marks = dcMarks(m), S = 92, R = dcRadius(m) * S, xs = m.atoms.map(a => a.x), ys = m.atoms.map(a => a.y), M = R + 16;
    const X = x => M + (x - Math.min(...xs)) * S, Y = y => M + (Math.max(...ys) - y) * S, Wd = (Math.max(...xs) - Math.min(...xs)) * S + 2 * M, Ht = (Math.max(...ys) - Math.min(...ys)) * S + 2 * M;
    m.atoms.forEach(a => kids.push(node('circle', { cx: r2(X(a.x)), cy: r2(Y(a.y)), r: r2(R), fill: 'none', stroke: P.gridStrong, 'stroke-width': 2, class: 'of-shell' })));
    m.atoms.forEach(a => kids.push(label(X(a.x), Y(a.y) + 1, a.el, { anchor: 'middle', size: 24, weight: 800, colour: P.ink })));
    if (!empty) {
      const els = [...new Set(m.atoms.map(a => a.el))], col = i => C[els.length === 1 ? i % 2 : els.indexOf(m.atoms[i].el)];
      for (const b of m.bonds) {
        const A1 = m.atoms[b.a], A2 = m.atoms[b.b], ax = X(A1.x), ay = Y(A1.y), bx = X(A2.x), by = Y(A2.y), len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, mx = (ax + bx) / 2, my = (ay + by) / 2;
        for (let j = 0, k = b.order ?? 1; j < k; j++) {
          const off = (j - (k - 1) / 2) * 15;
          kids.push(mark(marks[b.a], mx - uy * off - ux * 6, my + ux * off - uy * 6, col(b.a)), mark(marks[b.b], mx - uy * off + ux * 6, my + ux * off + uy * 6, col(b.b)));
        }
      }
      m.atoms.forEach((a, i) => {
        if (!a.lone) return;
        const used = m.bonds.filter(b => b.a === i || b.b === i).map(b => { const t = m.atoms[b.a === i ? b.b : b.a]; return Math.atan2(-(t.y - a.y), t.x - a.x); });
        for (const dir of dcFree(used, a.lone)) for (const s2 of [-0.16, 0.16]) kids.push(mark(marks[i], X(a.x) + R * Math.cos(dir + s2), Y(a.y) + R * Math.sin(dir + s2), col(i)));
      });
    }
    return frame(Wd, Ht, kids, { ...o, kind: 'dotCross' }, o.title || W('dotCross'));
  },
};
/** The shells' radius in bond lengths: overlapping where atoms bond, never where they do not. */
function dcRadius(m) {
  let apart = Infinity;
  m.atoms.forEach((a, i) => m.atoms.forEach((b, j) => { if (j > i && !m.bonds.some(x => (x.a === i && x.b === j) || (x.a === j && x.b === i))) apart = Math.min(apart, Math.hypot(a.x - b.x, a.y - b.y)); }));
  return Math.min(0.78, 0.48 * apart);
}
/** The free sides for n lone pairs (screen angles, y down): the set that keeps every pair and bond furthest apart. */
function dcFree(used, n) {
  const cand = [-Math.PI / 2, Math.PI / 2, 0, Math.PI, -Math.PI / 4, -3 * Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4], gap = (x, y) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
  let best = [], score = -1;
  const pick = (from, chosen) => {
    if (chosen.length === n) { const all = [...used, ...chosen]; let m = 9; for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) m = Math.min(m, gap(all[i], all[j])); const sc = m * 100 - chosen.reduce((t, c) => t + cand.indexOf(c), 0) * 0.01; if (sc > score + 1e-9) { score = sc; best = chosen; } return; }
    for (let i = from; i < cand.length; i++) pick(i + 1, [...chosen, cand[i]]);
  };
  pick(0, []);
  return best;
}

export const ATOM_KINDS = { nuclide, dotCross };
