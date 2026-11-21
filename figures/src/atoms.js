// Oomba Figures: nuclide notation (1.2.0, the chemistry pack). An isotope, an ion or a nuclear particle as it is
// written: the mass number at the top left and the atomic number at the bottom left, both right-aligned against the
// symbol, the charge at the top right; or in hyphen notation (C-14). The numbers come from the data and must make a
// nuclide: never fewer than 0 neutrons or electrons. The elements are all 118 (ported/elements.js); the checks, the
// answers and the typesetting are Oomba's own.
import { node, label, frame, palette, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { EL_SYMBOLS, EL_MAX_Z, elZ } from './ported/elements.js';

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

export const ATOM_KINDS = { nuclide };
