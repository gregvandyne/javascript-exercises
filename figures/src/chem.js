// Oomba Figures: chemistry. Bohr models, orbital box diagrams, Lewis structures (drawn here, plain SVG) and skeletal
// structures from SMILES (drawn by SmilesDrawer, MIT, in the browser: index.js structure()). Electron counts come from
// the element table and the filling rules, never from the drawing, and check() refuses data that breaks them.
import { node, label, line, frame, palette, isNum, text, hides, r2 } from './svg.js';
import { EL_SYMBOLS, EL_MAX_Z, EL_FILLING, elZ, elIon, elCore } from './ported/elements.js';

// Z -> [symbol, mass number of the commonest isotope, valence electrons (main groups; 0 where it is not used)]
export const ELEMENTS = [null,
  ['H', 1, 1], ['He', 4, 2], ['Li', 7, 1], ['Be', 9, 2], ['B', 11, 3], ['C', 12, 4], ['N', 14, 5], ['O', 16, 6], ['F', 19, 7], ['Ne', 20, 8],
  ['Na', 23, 1], ['Mg', 24, 2], ['Al', 27, 3], ['Si', 28, 4], ['P', 31, 5], ['S', 32, 6], ['Cl', 35, 7], ['Ar', 40, 8], ['K', 39, 1], ['Ca', 40, 2],
  ['Sc', 45, 0], ['Ti', 48, 0], ['V', 51, 0], ['Cr', 52, 0], ['Mn', 55, 0], ['Fe', 56, 0], ['Co', 59, 0], ['Ni', 58, 0], ['Cu', 63, 0], ['Zn', 64, 0],
  ['Ga', 69, 3], ['Ge', 74, 4], ['As', 75, 5], ['Se', 80, 6], ['Br', 79, 7], ['Kr', 84, 8],
];
export const MAX_Z = ELEMENTS.length - 1;
/** 'Na' | 11 -> 11, or 0. */
export function zOf(el) {
  if (Number.isInteger(el) && el >= 1 && el <= MAX_Z) return el;
  const s = String(el || '').trim();
  const i = ELEMENTS.findIndex(e => e && e[0] === s);
  return i > 0 ? i : 0;
}
const elOf = d => zOf(d && (d.element ?? d.Z));
const chargeOf = d => (d && Number.isInteger(d.charge) ? d.charge : 0);
const supNum = n => (n === 0 ? '' : `${Math.abs(n) === 1 ? '' : Math.abs(n)}${n > 0 ? '+' : '−'}`);

// ---------------------------------------------------------------- Bohr model
/** The school model's shells: 2, then 8, 8, 2 (up to 20 electrons). */
export function bohrShells(e) {
  const out = [];
  for (const cap of [2, 8, 8, 2]) { if (e <= 0) break; out.push(Math.min(cap, e)); e -= cap; }
  return e > 0 ? null : out;
}
/**
 * { element: 'Na' | Z (1 to 20; up to 36 with "shells"), charge?: an ion's charge (Na+ is 1, Cl− is −1), shells?:
 * [2, 8, 1] (only to override the school rule, e.g. for Z above 20), nucleus?: true (protons and neutrons: the
 * commonest isotope) }. The electrons on each shell are spaced out the usual way: one at a time at the top, bottom,
 * right and left, then in pairs. hide (or 'electrons'): the shells are drawn empty; 'nucleus': "? p, ? n".
 */
export const bohr = {
  check(d) {
    const out = [], Z = elOf(d), q = chargeOf(d);
    if (!Z) out.push(`"element" must be a symbol from H to ${ELEMENTS[MAX_Z][0]} (or "Z", 1 to ${MAX_Z})`);
    if (d && d.charge !== undefined && !Number.isInteger(d.charge)) out.push('"charge" must be a whole number (Na+ is 1, O2− is −2)');
    if (!Z) return out;
    const e = Z - q;
    if (e < 0 || q < -3 || q > 3) out.push('the charge is too big for this element');
    else if (Array.isArray(d.shells)) {
      const s = d.shells;
      if (!s.length || s.length > 4 || s.some(x => !Number.isInteger(x) || x < 1)) out.push('"shells" must list 1 to 4 whole numbers, each at least 1');
      else if (s.reduce((a, b) => a + b, 0) !== e) out.push(`"shells" adds up to ${s.reduce((a, b) => a + b, 0)}, but ${ELEMENTS[Z][0]}${supNum(q)} has ${e} electrons`);
      else if (s.some((x, i) => x > 2 * (i + 1) ** 2)) out.push('a shell has more electrons than it can hold (2, 8, 18, 32)');
      else if (s[s.length - 1] > 8 && s.length > 1) out.push('the outer shell has more than 8 electrons');
    } else if (!bohrShells(e)) out.push(`${ELEMENTS[Z][0]}${supNum(q)} has ${e} electrons: the school model is for up to 20; give "shells" for more`);
    if (!out.length && d.ionMarks !== undefined) {
      if (typeof d.ionMarks !== 'boolean') out.push('"ionMarks" must be true or false');
      else if (d.ionMarks && (!q || Array.isArray(d.shells) || !bohrShells(Z))) out.push('"ionMarks" shows the electrons an ion gained or lost: it needs a "charge", the school model (H to Ca) and no "shells"');
    }
    return out;
  },
  /** The electrons on each shell, as drawn. */
  shells: d => (Array.isArray(d.shells) ? d.shells.slice() : bohrShells(elOf(d) - chargeOf(d))),
  /** Where the k-th of n electrons sits on a shell (degrees, 0 = right, 90 = top). */
  slots(n, shell) {
    if (shell === 0) return n === 1 ? [90] : [90, 270];
    if (n > 8) return Array.from({ length: n }, (_, i) => 90 - (360 * i) / n);
    const base = [90, 270, 0, 180], out = [];
    for (let i = 0; i < n; i++) out.push(base[i % 4] + (n > 4 + (i % 4) ? (i < 4 ? 11 : -11) : 0));
    return out;
  },
  draw(d, o) {
    if (d.ionMarks) return bohrIonDraw(d, o);
    const P = palette(o), Z = elOf(d), q = chargeOf(d), shells = bohr.shells(d), [sym, A] = ELEMENTS[Z];
    const noE = o.hide === true || hides(o, 'electrons'), R0 = 34, gap = 30, Rmax = R0 + gap * shells.length, C = Rmax + 26;
    const kids = [];
    shells.forEach((n, i) => {
      const r = R0 + gap * (i + 1);
      kids.push(node('circle', { cx: C, cy: C, r, fill: 'none', stroke: P.gridStrong, 'stroke-width': 2 }));
      if (!noE) for (const a of bohr.slots(n, i)) {
        const t = (a * Math.PI) / 180;
        kids.push(node('circle', { cx: r2(C + r * Math.cos(t)), cy: r2(C - r * Math.sin(t)), r: 6.5, fill: P.blue, stroke: P.paper, 'stroke-width': 1.5, class: 'of-e' }));
      }
    });
    const hideN = hides(o, 'nucleus');
    kids.push(node('circle', { cx: C, cy: C, r: R0 - 4, fill: P.fill, stroke: P.green, 'stroke-width': 2.5 }),
      label(C, C - 8, hideN ? '? p' : `${Z} p`, { anchor: 'middle', size: 13, colour: P.greenInk }),
      label(C, C + 9, hideN ? '? n' : `${A - Z} n`, { anchor: 'middle', size: 13, colour: P.greenInk }));
    const name = `${sym}${q ? supNum(q) : ''}`;
    kids.push(label(C, 2 * C + 6, name, { anchor: 'middle', size: 20, weight: 800, colour: P.ink }));
    if (q) kids.push(line(10, 10, 4, 10, P.ink, 2.5), line(4, 10, 4, 2 * C - 10, P.ink, 2.5), line(4, 2 * C - 10, 10, 2 * C - 10, P.ink, 2.5),
      line(2 * C - 10, 10, 2 * C - 4, 10, P.ink, 2.5), line(2 * C - 4, 10, 2 * C - 4, 2 * C - 10, P.ink, 2.5), line(2 * C - 4, 2 * C - 10, 2 * C - 10, 2 * C - 10, P.ink, 2.5),
      label(2 * C + 2, 14, supNum(q), { size: 18, colour: P.ink }));
    return frame(2 * C + (q ? 30 : 0), 2 * C + 24, kids, { ...o, kind: 'bohr' }, o.title || `Bohr model of ${name}`);
  },
};

/** 1.2.0, "ionMarks": true: an ion drawn with the electrons it gained as crosses (×) on its outer shell, and the ones
 *  it lost as open circles on a dashed shell (where they were in the atom). */
function bohrIonDraw(d, o) {
  const P = palette(o), Z = elOf(d), q = chargeOf(d), ion = bohrShells(Z - q), atom = bohrShells(Z), [sym, A] = ELEMENTS[Z];
  const noE = o.hide === true || hides(o, 'electrons'), R0 = 34, gap = 30, n = Math.max(ion.length, atom.length), C = R0 + gap * n + 26, kids = [];
  const at = (r, a) => { const t = (a * Math.PI) / 180; return [r2(C + r * Math.cos(t)), r2(C - r * Math.sin(t))]; };
  ion.forEach((cnt, i) => {
    const r = R0 + gap * (i + 1), gained = q < 0 && i === ion.length - 1 ? -q : 0;
    kids.push(node('circle', { cx: C, cy: C, r, fill: 'none', stroke: P.gridStrong, 'stroke-width': 2 }));
    if (!noE) bohr.slots(cnt, i).forEach((a, k) => {
      const [x, y] = at(r, a);
      if (k >= cnt - gained) kids.push(node('g', { class: 'of-gained' }, line(x - 5.5, y - 5.5, x + 5.5, y + 5.5, P.red, 2.6), line(x - 5.5, y + 5.5, x + 5.5, y - 5.5, P.red, 2.6)));
      else kids.push(node('circle', { cx: x, cy: y, r: 6.5, fill: P.blue, stroke: P.paper, 'stroke-width': 1.5, class: 'of-e' }));
    });
  });
  // the shells the cation emptied: dashed, with an open circle where each lost electron was
  for (let i = ion.length; i < atom.length; i++) {
    const r = R0 + gap * (i + 1);
    kids.push(node('circle', { cx: C, cy: C, r, fill: 'none', stroke: P.muted, 'stroke-width': 1.6, 'stroke-dasharray': '5 5', class: 'of-lost-shell' }));
    if (!noE) bohr.slots(atom[i], i).forEach(a => { const [x, y] = at(r, a); kids.push(node('circle', { cx: x, cy: y, r: 6, fill: P.paper, stroke: P.blue, 'stroke-width': 1.8, 'stroke-dasharray': '3 2', class: 'of-lost' })); });
  }
  const hideN = hides(o, 'nucleus');
  kids.push(node('circle', { cx: C, cy: C, r: R0 - 4, fill: P.fill, stroke: P.green, 'stroke-width': 2.5 }),
    label(C, C - 8, hideN ? '? p' : `${Z} p`, { anchor: 'middle', size: 13, colour: P.greenInk }), label(C, C + 9, hideN ? '? n' : `${A - Z} n`, { anchor: 'middle', size: 13, colour: P.greenInk }));
  const name = `${sym}${supNum(q)}`;
  kids.push(label(C, 2 * C + 6, name, { anchor: 'middle', size: 20, weight: 800, colour: P.ink }),
    line(10, 10, 4, 10, P.ink, 2.5), line(4, 10, 4, 2 * C - 10, P.ink, 2.5), line(4, 2 * C - 10, 10, 2 * C - 10, P.ink, 2.5),
    line(2 * C - 10, 10, 2 * C - 4, 10, P.ink, 2.5), line(2 * C - 4, 10, 2 * C - 4, 2 * C - 10, P.ink, 2.5), line(2 * C - 4, 2 * C - 10, 2 * C - 10, 2 * C - 10, P.ink, 2.5),
    label(2 * C + 2, 14, supNum(q), { size: 18, colour: P.ink }));
  return frame(2 * C + 30, 2 * C + 24, kids, { ...o, kind: 'bohr' }, o.title || `Bohr model of ${name}`);
}

// ---------------------------------------------------------------- orbital box diagram
const SUBS = [['1s', 1], ['2s', 1], ['2p', 3], ['3s', 1], ['3p', 3], ['4s', 1], ['3d', 5], ['4p', 3]];
const CAP = k => 2 * k;
/** Electrons in each subshell, in filling order: { '1s': 2, ... }. Cr and Cu take one 4s electron into 3d (half full
 *  and full d). An ion loses its outermost electrons first (4p, then 4s, then 3d) and an anion gains them in order. */
export function configOf(Z, q = 0) {
  const fill = e => { const out = {}; for (const [s, k] of SUBS) { if (e <= 0) break; out[s] = Math.min(CAP(k), e); e -= CAP(k); } return out; };
  const c = fill(q < 0 ? Z - q : Z);
  if (Z === 24 || Z === 29) { c['4s'] = 1; c['3d'] = Z === 24 ? 5 : 10; }
  if (q > 0) {
    let left = q;
    const order = Object.keys(c).sort((a, b) => +b[0] - +a[0] || 'spdf'.indexOf(b[1]) - 'spdf'.indexOf(a[1]));
    for (const s of order) { const take = Math.min(c[s], left); c[s] -= take; left -= take; if (!left) break; }
    for (const s of Object.keys(c)) if (!c[s]) delete c[s];
  }
  return c;
}
/** "1s² 2s² 2p⁴" (in filling order). */
export function configText(c) {
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return SUBS.filter(([s]) => c[s]).map(([s]) => `${s}${String(c[s]).split('').map(x => SUP[x]).join('')}`).join(' ');
}
/** Hund's rule: one up arrow in each box first, then the down arrows. -> [[up, down], ...] per box. */
export function boxesOf(n, k) { const out = Array.from({ length: k }, () => [false, false]); for (let i = 0; i < n; i++) { if (i < k) out[i][0] = true; else out[i - k][1] = true; } return out; }
/**
 * { element: 'O' | Z (1 to 36), charge?: an ion's charge, config?: true (write the configuration under the boxes) }.
 * hide (or 'arrows'): the boxes are empty and the configuration is blank, for the student to fill.
 */
export const orbitals = {
  check(d) {
    if (orbWide(d)) return orbWideCheck(d);
    const out = [], Z = elOf(d), q = chargeOf(d);
    if (!Z) out.push(`"element" must be a symbol from H to ${ELEMENTS[MAX_Z][0]} (or "Z", 1 to ${MAX_Z})`);
    if (d && d.charge !== undefined && !Number.isInteger(d.charge)) out.push('"charge" must be a whole number');
    if (Z && (Z - q < 0 || Z - q > MAX_Z || Math.abs(q) > 3)) out.push('that ion cannot be drawn here (too many or too few electrons)');
    return out;
  },
  /** The configuration (1.2.0): each sublevel's electrons in filling order, written out, and the noble gas core. */
  solve(d) {
    if (orbitals.check(d).length) return null;
    const Z = orbWide(d) ? elZ(d.element ?? d.Z) : elOf(d), q = chargeOf(d), c = orbWide(d) ? orbConfig(Z, q) : configOf(Z, q), core = elCore(c);
    return { Z, charge: q, electrons: Z - q, config: c, text: orbText(c, null), core: core ? core.symbol : null, coreText: core ? orbText(c, core) : null, unpaired: Object.entries(c).reduce((s, [k, n]) => { const orb = EL_FILLING.find(x => x.name === k).orbitals; return s + (n <= orb ? n : 2 * orb - n); }, 0) };
  },
  draw(d, o) {
    if (orbWide(d)) return orbWideDraw(d, o);
    const P = palette(o), Z = elOf(d), q = chargeOf(d), c = configOf(Z, q), blank = o.hide === true || hides(o, 'arrows');
    const last = Math.max(...SUBS.map(([s], i) => (c[s] ? i : -1)), 0), list = SUBS.slice(0, last + 1);
    const B = 34, kids = [];
    let x = 14;
    for (const [s, k] of list) {
      const boxes = boxesOf(c[s] || 0, k);
      kids.push(label(x + (k * B) / 2, 80, s, { anchor: 'middle', size: 15, colour: P.ink }));
      boxes.forEach((b, i) => {
        const bx = x + i * B;
        kids.push(node('rect', { x: bx, y: 22, width: B, height: B + 6, fill: P.paper, stroke: P.ink, 'stroke-width': 2 }));
        if (!blank) {
          if (b[0]) kids.push(arrowUD(bx + B / 2 - 6, 22, B + 6, true, P.blue));
          if (b[1]) kids.push(arrowUD(bx + B / 2 + 6, 22, B + 6, false, P.red));
        }
      });
      x += k * B + 16;
    }
    const W = Math.max(x, 220), name = `${ELEMENTS[Z][0]}${supNum(q)}`;
    kids.push(label(14, 108, blank ? `${name}: ____________` : `${name}: ${configText(c)}`, { size: 15, colour: P.ink }));
    return frame(W, 124, kids, { ...o, kind: 'orbitals' }, o.title || `Orbital diagram of ${name}`);
  },
};
// 1.2.0: any of the 118 elements (ported/elements.js: the real ground states), "core": true (the noble gas core in
// brackets, only the sublevels past it drawn), and "arrangement": "energy" (the sublevels stacked up by energy, lowest
// at the bottom). Without them, an element up to Kr draws exactly as before.
const orbWide = d => !!d && (d.core !== undefined || d.arrangement !== undefined || (!elOf(d) && !!elZ(d.element ?? d.Z)) || (!!elOf(d) && elOf(d) - chargeOf(d) > MAX_Z));
function orbWideCheck(d) {
  const out = [], Z = elZ(d.element ?? d.Z), q = chargeOf(d);
  if (!Z) return [`"element" must be a symbol from H to Og (or "Z", 1 to ${EL_MAX_Z})`];
  if (d.charge !== undefined && !Number.isInteger(d.charge)) out.push('"charge" must be a whole number');
  else if (Math.abs(q) > 4 || Z - q < 0 || Z - q > EL_MAX_Z) out.push('that ion cannot be drawn here (too many or too few electrons)');
  if (d.core !== undefined && typeof d.core !== 'boolean') out.push('"core" must be true or false');
  if (d.arrangement !== undefined && !['row', 'energy'].includes(d.arrangement)) out.push('"arrangement" must be "row" or "energy"');
  return out;
}
/** An atom's or ion's configuration in filling order, empty sublevels left out. */
const orbConfig = (Z, q) => Object.fromEntries(EL_FILLING.map(s => [s.name, elIon(Z, q)[s.name] || 0]).filter(([, n]) => n));
const SUP_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/** "[Ar] 4s² 3d⁶" (core given) or "1s² 2s² ..." in filling order. */
function orbText(c, core) {
  const names = EL_FILLING.map(s => s.name).filter(k => c[k] && !(core && core.sublevels.includes(k)));
  return [...(core ? [`[${core.symbol}]`] : []), ...names.map(k => `${k}${String(c[k]).split('').map(x => SUP_DIGITS[+x]).join('')}`)].join(' ') || '1s⁰';
}
function orbWideDraw(d, o) {
  const P = palette(o), Z = elZ(d.element ?? d.Z), q = chargeOf(d), c = orbConfig(Z, q), core = d.core ? elCore(c) : null, blank = o.hide === true || hides(o, 'arrows');
  const lastI = Math.max(0, ...EL_FILLING.map((s, i) => (c[s.name] ? i : -1)));
  const list = EL_FILLING.slice(0, lastI + 1).filter(s => !(core && core.sublevels.includes(s.name)));
  const B = 34, kids = [], energy = d.arrangement === 'energy', name = `${EL_SYMBOLS[Z]}${supNum(q)}`;
  let x = 14, W = 220, H;
  const boxesAt = (s, bx, by) => boxesOf(c[s.name] || 0, s.orbitals).forEach((b, i) => {
    const x0 = bx + i * B;
    kids.push(node('rect', { x: x0, y: by, width: B, height: B + 6, fill: P.paper, stroke: P.ink, 'stroke-width': 2 }));
    if (!blank) { if (b[0]) kids.push(arrowUD(x0 + B / 2 - 6, by, B + 6, true, P.blue)); if (b[1]) kids.push(arrowUD(x0 + B / 2 + 6, by, B + 6, false, P.red)); }
  });
  if (energy) {
    // lowest energy at the bottom: each sublevel a row, its name at the left
    const rowH = B + 20, top = 14;
    list.slice().reverse().forEach((s, k) => { const y = top + k * rowH; kids.push(label(36, y + (B + 6) / 2, s.name, { anchor: 'end', size: 15, colour: P.ink })); boxesAt(s, 46, y); W = Math.max(W, 46 + s.orbitals * B + 14); });
    H = top + list.length * rowH + 4;
  } else {
    for (const s of list) { kids.push(label(x + (s.orbitals * B) / 2, 80, s.name, { anchor: 'middle', size: 15, colour: P.ink })); boxesAt(s, x, 22); x += s.orbitals * B + 16; }
    W = Math.max(x, 220); H = 92;
  }
  kids.push(label(14, H + 16, blank ? `${name}: ____________` : `${name}: ${orbText(c, core)}`, { size: 15, colour: P.ink }));
  return frame(W, H + 32, kids, { ...o, kind: 'orbitals' }, o.title || `Orbital diagram of ${name}`);
}
function arrowUD(x, y, h, up, c) {
  const t = y + 7, b = y + h - 7;
  return node('g', {}, line(x, t, x, b, c, 2.5), up ? node('polygon', { points: `${x},${t - 2} ${x - 5},${t + 8} ${x + 5},${t + 8}`, fill: c }) : node('polygon', { points: `${x},${b + 2} ${x - 5},${b - 8} ${x + 5},${b - 8}`, fill: c }));
}

// ---------------------------------------------------------------- Lewis structures
// Ready ones (x and y in bond lengths, y up): every atom's electrons and the total were checked by check() in the tests.
const A = (el, x, y, lone = 0) => ({ el, x, y, lone });
const Bd = (a, b, order = 1) => ({ a, b, order });
export const MOLECULES = {
  H2: { atoms: [A('H', 0, 0), A('H', 1, 0)], bonds: [Bd(0, 1)] },
  F2: { atoms: [A('F', 0, 0, 3), A('F', 1.2, 0, 3)], bonds: [Bd(0, 1)] },
  Cl2: { atoms: [A('Cl', 0, 0, 3), A('Cl', 1.3, 0, 3)], bonds: [Bd(0, 1)] },
  O2: { atoms: [A('O', 0, 0, 2), A('O', 1.2, 0, 2)], bonds: [Bd(0, 1, 2)] },
  N2: { atoms: [A('N', 0, 0, 1), A('N', 1.2, 0, 1)], bonds: [Bd(0, 1, 3)] },
  HCl: { atoms: [A('H', 0, 0), A('Cl', 1.2, 0, 3)], bonds: [Bd(0, 1)] },
  HF: { atoms: [A('H', 0, 0), A('F', 1.1, 0, 3)], bonds: [Bd(0, 1)] },
  H2O: { atoms: [A('O', 0, 0, 2), A('H', -0.85, -0.6), A('H', 0.85, -0.6)], bonds: [Bd(0, 1), Bd(0, 2)] },
  NH3: { atoms: [A('N', 0, 0, 1), A('H', -1, -0.35), A('H', 1, -0.35), A('H', 0, -1.05)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3)] },
  CH4: { atoms: [A('C', 0, 0), A('H', 0, 1), A('H', 1, 0), A('H', 0, -1), A('H', -1, 0)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3), Bd(0, 4)] },
  CCl4: { atoms: [A('C', 0, 0), A('Cl', 0, 1.3, 3), A('Cl', 1.3, 0, 3), A('Cl', 0, -1.3, 3), A('Cl', -1.3, 0, 3)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3), Bd(0, 4)] },
  CO2: { atoms: [A('O', -1.2, 0, 2), A('C', 0, 0), A('O', 1.2, 0, 2)], bonds: [Bd(0, 1, 2), Bd(1, 2, 2)] },
  HCN: { atoms: [A('H', -1.1, 0), A('C', 0, 0), A('N', 1.2, 0, 1)], bonds: [Bd(0, 1), Bd(1, 2, 3)] },
  C2H4: { atoms: [A('C', -0.6, 0), A('C', 0.6, 0), A('H', -1.3, 0.75), A('H', -1.3, -0.75), A('H', 1.3, 0.75), A('H', 1.3, -0.75)], bonds: [Bd(0, 1, 2), Bd(0, 2), Bd(0, 3), Bd(1, 4), Bd(1, 5)] },
  C2H2: { atoms: [A('H', -1.7, 0), A('C', -0.6, 0), A('C', 0.6, 0), A('H', 1.7, 0)], bonds: [Bd(0, 1), Bd(1, 2, 3), Bd(2, 3)] },
  NH4: { atoms: [A('N', 0, 0), A('H', 0, 1), A('H', 1, 0), A('H', 0, -1), A('H', -1, 0)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3), Bd(0, 4)], charge: 1 },
  OH: { atoms: [A('O', 0, 0, 3), A('H', 1.1, 0)], bonds: [Bd(0, 1)], charge: -1 },
  // 1.2.0: more molecules and ions that keep the octet rule
  H2S: { atoms: [A('S', 0, 0, 2), A('H', -0.95, -0.65), A('H', 0.95, -0.65)], bonds: [Bd(0, 1), Bd(0, 2)] },
  PH3: { atoms: [A('P', 0, 0, 1), A('H', -1, -0.35), A('H', 1, -0.35), A('H', 0, -1.05)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3)] },
  PCl3: { atoms: [A('P', 0, 0, 1), A('Cl', -1.25, -0.45, 3), A('Cl', 1.25, -0.45, 3), A('Cl', 0, -1.35, 3)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3)] },
  NF3: { atoms: [A('N', 0, 0, 1), A('F', -1.15, -0.4, 3), A('F', 1.15, -0.4, 3), A('F', 0, -1.25, 3)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3)] },
  OF2: { atoms: [A('O', 0, 0, 2), A('F', -1.05, -0.7, 3), A('F', 1.05, -0.7, 3)], bonds: [Bd(0, 1), Bd(0, 2)] },
  SiH4: { atoms: [A('Si', 0, 0), A('H', 0, 1.05), A('H', 1.05, 0), A('H', 0, -1.05), A('H', -1.05, 0)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3), Bd(0, 4)] },
  CF4: { atoms: [A('C', 0, 0), A('F', 0, 1.2, 3), A('F', 1.2, 0, 3), A('F', 0, -1.2, 3), A('F', -1.2, 0, 3)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3), Bd(0, 4)] },
  CH3Cl: { atoms: [A('C', 0, 0), A('H', 0, 1), A('H', 1, 0), A('H', -1, 0), A('Cl', 0, -1.3, 3)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3), Bd(0, 4)] },
  H2O2: { atoms: [A('H', -1.6, 0.6), A('O', -0.6, 0, 2), A('O', 0.6, 0, 2), A('H', 1.6, -0.6)], bonds: [Bd(0, 1), Bd(1, 2), Bd(2, 3)] },
  C2H6: { atoms: [A('C', -0.6, 0), A('C', 0.6, 0), A('H', -0.6, 1), A('H', -1.6, 0), A('H', -0.6, -1), A('H', 0.6, 1), A('H', 1.6, 0), A('H', 0.6, -1)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3), Bd(0, 4), Bd(1, 5), Bd(1, 6), Bd(1, 7)] },
  HOCl: { atoms: [A('H', -1.1, 0), A('O', 0, 0, 2), A('Cl', 1.3, 0, 3)], bonds: [Bd(0, 1), Bd(1, 2)] },
  CO: { atoms: [A('C', 0, 0, 1), A('O', 1.2, 0, 1)], bonds: [Bd(0, 1, 3)] },
  CN: { atoms: [A('C', 0, 0, 1), A('N', 1.2, 0, 1)], bonds: [Bd(0, 1, 3)], charge: -1 },
  H3O: { atoms: [A('O', 0, 0, 1), A('H', -1, -0.45), A('H', 1, -0.45), A('H', 0, 1.05)], bonds: [Bd(0, 1), Bd(0, 2), Bd(0, 3)], charge: 1 },
  HCHO: { atoms: [A('C', 0, 0), A('O', 0, 1.2, 2), A('H', -0.95, -0.6), A('H', 0.95, -0.6)], bonds: [Bd(0, 1, 2), Bd(0, 2), Bd(0, 3)] },
};
const lewisOf = d => (d && typeof d.molecule === 'string' && MOLECULES[d.molecule.replace(/[+−-]$/, '')] ? MOLECULES[d.molecule.replace(/[+−-]$/, '')] : d);
/**
 * { molecule: 'H2O' (one of MOLECULES) } or your own { atoms: [{ el, x, y, lone: lone pairs }], bonds: [{ a, b, order:
 * 1 | 2 | 3 }], charge?: the ion's charge }. Bonds are lines (style 'dots': each shared pair as two dots); lone pairs
 * are pairs of dots on the free sides of the atom. check(): hydrogen has 2 electrons, every other atom 8, and the
 * electrons add up to the atoms' valence electrons minus the charge. hide: 'lone' (no lone pairs) or true (the atoms
 * only, for the student to finish).
 */
export const lewis = {
  check(d0) {
    const out = [], d = lewisOf(d0);
    if (d0 && typeof d0.molecule === 'string' && d === d0) return [`unknown "molecule" (ready ones: ${Object.keys(MOLECULES).join(', ')}); or give "atoms" and "bonds"`];
    const atoms = d && Array.isArray(d.atoms) ? d.atoms : null, bonds = d && Array.isArray(d.bonds) ? d.bonds : [];
    if (!atoms || atoms.length < 1 || atoms.length > 12) return ['"atoms" must list 1 to 12 atoms { el, x, y, lone }'];
    atoms.forEach((a, i) => {
      const Z = zOf(a && a.el);
      if (!Z || !ELEMENTS[Z][2]) out.push(`atom ${i + 1}: "el" must be a main-group element symbol`);
      if (!a || !isNum(a.x, -10, 10) || !isNum(a.y, -10, 10)) out.push(`atom ${i + 1} needs "x" and "y" (bond lengths)`);
      if (a && a.lone !== undefined && !(Number.isInteger(a.lone) && a.lone >= 0 && a.lone <= 4)) out.push(`atom ${i + 1}: "lone" is its lone pairs, 0 to 4`);
    });
    bonds.forEach((b, i) => { if (!b || !atoms[b.a] || !atoms[b.b] || b.a === b.b || ![1, 2, 3].includes(b.order ?? 1)) out.push(`bond ${i + 1} must be { a, b, order: 1, 2 or 3 } between two different atoms`); });
    if (out.length) return out;
    const q = Number.isInteger(d.charge) ? d.charge : 0;
    let total = 0, drawn = 0;
    atoms.forEach((a, i) => {
      const Z = zOf(a.el), shared = bonds.filter(b => b.a === i || b.b === i).reduce((s, b) => s + (b.order ?? 1), 0), mine = 2 * shared + 2 * (a.lone || 0);
      total += ELEMENTS[Z][2]; drawn += 2 * (a.lone || 0);
      const want = Z <= 2 ? 2 : 8;
      if (mine !== want && !d.expanded) out.push(`atom ${i + 1} (${a.el}) has ${mine} electrons around it; it needs ${want}`);
    });
    drawn += 2 * bonds.reduce((s, b) => s + (b.order ?? 1), 0);
    if (drawn !== total - q) out.push(`the structure shows ${drawn} electrons, but the atoms bring ${total - q} (valence electrons${q ? ' minus the charge' : ''})`);
    return out;
  },
  draw(d0, o) {
    const P = palette(o), d = lewisOf(d0), q = Number.isInteger(d.charge) ? d.charge : Number.isInteger(d0.charge) ? d0.charge : 0;
    const S = 64, xs = d.atoms.map(a => a.x), ys = d.atoms.map(a => a.y);
    const x0 = Math.min(...xs), y1 = Math.max(...ys), M = 46;
    const X = x => M + (x - x0) * S, Y = y => M + (y1 - y) * S;
    const W = (Math.max(...xs) - x0) * S + 2 * M + (q ? 30 : 0), H = (y1 - Math.min(...ys)) * S + 2 * M;
    const kids = [], atomsOnly = o.hide === true, noLone = atomsOnly || hides(o, 'lone'), dots = d0.style === 'dots' || d.style === 'dots';
    for (const b of atomsOnly ? [] : d.bonds) {
      const A1 = d.atoms[b.a], A2 = d.atoms[b.b], ax = X(A1.x), ay = Y(A1.y), bx = X(A2.x), by = Y(A2.y), len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, px = -uy, py = ux;
      const k = b.order ?? 1, sh = 17;
      if (dots) {
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        for (let j = 0; j < k; j++) { const off = (j - (k - 1) / 2) * 9; for (const s of [-4, 4]) kids.push(node('circle', { cx: r2(mx + px * off + ux * s), cy: r2(my + py * off + uy * s), r: 3, fill: P.ink })); }
      } else for (let j = 0; j < k; j++) {
        const off = (j - (k - 1) / 2) * 7;
        kids.push(line(ax + ux * sh + px * off, ay + uy * sh + py * off, bx - ux * sh + px * off, by - uy * sh + py * off, P.ink, 2.6));
      }
    }
    d.atoms.forEach((a, i) => {
      const cx = X(a.x), cy = Y(a.y);
      kids.push(label(cx, cy + 1, a.el, { anchor: 'middle', size: 26, weight: 800, colour: P.ink }));
      if (noLone || !a.lone) return;
      // the bonds' directions from this atom; each lone pair goes to the free side furthest from them
      const used = d.bonds.filter(b => b.a === i || b.b === i).map(b => { const o2 = d.atoms[b.a === i ? b.b : b.a]; return Math.atan2(-(o2.y - a.y), o2.x - a.x); });
      // all the lone pairs together: the set of free sides that keeps every pair and bond furthest apart (ties: the
      // top, bottom and sides first)
      const cand = [-Math.PI / 2, Math.PI / 2, 0, Math.PI, -Math.PI / 4, -3 * Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4];
      const gap = (x, y) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
      let best = null, bestScore = -1;
      const pick = (from, chosen) => {
        if (chosen.length === a.lone) {
          const all = [...used, ...chosen]; let m = 9;
          for (let i2 = 0; i2 < all.length; i2++) for (let j = i2 + 1; j < all.length; j++) m = Math.min(m, gap(all[i2], all[j]));
          const score = m * 100 - chosen.reduce((t, c) => t + cand.indexOf(c), 0) * 0.01;
          if (score > bestScore + 1e-9) { bestScore = score; best = chosen; }
          return;
        }
        for (let i2 = from; i2 < cand.length; i2++) pick(i2 + 1, [...chosen, cand[i2]]);
      };
      pick(0, []);
      for (const dir of best || []) {
        const ux = Math.cos(dir), uy = Math.sin(dir), r = (a.el.length > 1 ? 25 : 22) + (Math.abs(ux) > 0.2 && Math.abs(uy) > 0.2 ? 4 : 0);
        for (const sgn of [-5, 5]) kids.push(node('circle', { cx: r2(cx + ux * r - uy * sgn), cy: r2(cy + uy * r + ux * sgn), r: 3, fill: P.blue, class: 'of-lone' }));
      }
    });
    if (q) kids.push(label(6, H / 2, '[', { size: 56, weight: 300, colour: P.ink }), label(W - 34, H / 2, ']', { size: 56, weight: 300, colour: P.ink }), label(W - 20, 18, supNum(q), { size: 18, colour: P.ink }));
    return frame(W, H, kids, { ...o, kind: 'lewis' }, o.title || 'Lewis structure');
  },
};

export const CHEM = { bohr, orbitals, lewis };
