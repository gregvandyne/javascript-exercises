// Oomba Figures: atomic energy levels with transitions (1.5.0, the chemistry pack). A hydrogen atom's levels (or a
// one-electron ion's: He+, Li2+ and on, E = -13.6 Z^2 / n^2 eV, the textbook Bohr value) or any atom's levels given in
// eV, each line drawn exactly at its energy on a vertical scale, with the ionization level (n = infinity, 0 eV) at the
// top. Each transition is a vertical arrow between its two levels: down for emission, up for absorption (to infinity
// for ionization), labeled with its photon's wavelength or energy, worked out from the levels (lambda = hc / dE), and,
// on screen, in the photon's color when it can be seen. Hydrogen's series (Lyman, Balmer, Paschen, ...) can be named.
// Levels too close together for an arrow at this size are refused (make it taller, or leave that arrow out), never
// drawn wrong. Oomba's own code: the checks, the answers (OF.solve) and the drawing.
import { node, label, line, arrow, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { spColor } from './ported/spectra.js';

const AL_KEYS = ['kind', 'hide', 'z', 'top', 'levels', 'transitions', 'cascade', 'show', 'unit', 'series', 'ionization', 'height', 'heading'];
const AL_RYD = 13.6;                         // eV, the Bohr model's hydrogen ground state (textbook value)
const AL_HC = 1239.84198;                    // eV nm (h c, exact SI constants)
const AL_E = 1.602176634e-19;                // J per eV
const AL_C = 299792458;                      // m/s
const AL_SERIES = ['lyman', 'balmer', 'paschen', 'brackett', 'pfund', 'humphreys'];
const AL_ION = ['H', 'He⁺', 'Li²⁺', 'Be³⁺', 'B⁴⁺', 'C⁵⁺'];
const alMinus = s => String(s).replace(/^-/, '−');
/** The levels, ground state first: [{ n, energy (eV) }]. */
function alLevels(d) {
  if (d.levels !== undefined) return [...d.levels].sort((a, b) => a - b).map((e, i) => ({ n: i + 1, energy: e }));
  const z = d.z || 1, top = d.top || 6;
  return Array.from({ length: top }, (_, i) => ({ n: i + 1, energy: (-AL_RYD * z * z) / ((i + 1) * (i + 1)) }));
}
const alTo = v => (v === 'inf' ? Infinity : v);
/** The transitions asked for: [{ from, to }] (to Infinity for ionization), a cascade's every way down. */
function alTransitions(d) {
  if (d.cascade !== undefined) { const out = []; for (let a = d.cascade; a > 1; a--) for (let b = a - 1; b >= 1; b--) out.push({ from: a, to: b }); return out; }
  return (d.transitions || []).map(t => ({ from: t.from, to: alTo(t.to) }));
}
const alRegion = nm => (nm < 380 ? 'uv' : nm > 750 ? 'ir' : 'visible');
/** One photon: its energy (eV, J), wavelength (nm), frequency (Hz), region, emission or absorption, and series. */
function alPhoton(d, levels, t) {
  const E = n => (n === Infinity ? 0 : levels[n - 1].energy), dE = Math.abs(E(t.to) - E(t.from));
  const nm = AL_HC / dE, out = { from: t.from, to: t.to === Infinity ? 'inf' : t.to, type: E(t.to) < E(t.from) ? 'emission' : 'absorption', energy: dE, joules: dE * AL_E, wavelength: nm, frequency: AL_C / (nm * 1e-9), region: alRegion(nm) };
  if (d.levels === undefined && t.to !== Infinity) out.series = AL_SERIES[Math.min(t.from, t.to) - 1] || null;
  return out;
}
const alHeight = d => d.height || 360;
/** px per eV, and the lowest energy drawn. */
const alScale = (d, levels) => { const lo = levels[0].energy; return { lo, k: alHeight(d) / -lo }; };

/**
 * { z?: 1 (hydrogen; 2 He+, 3 Li2+, ... up to 6) and top?: 6 (the highest n drawn, 2 to 7), or levels: [-10.4, -5.5,
 * -3.7, -1.6] (any atom's levels in eV, each below 0; 2 to 8 of them, numbered from the ground state), transitions?:
 * [{ from: 3, to: 2 }] (to: "inf" ionizes) or cascade?: 4 (every way down from that level), show?: "wavelength" |
 * "energy" | "both" | "none", unit?: "eV" | "J" (the levels' labels), series?: true (hydrogen's series named),
 * ionization?: true (the n = infinity line), height?: 360 (px for the drawing; taller fits closer levels), heading? }.
 * hide: "values" (the arrows' labels), "levels" (the levels' energies), true (both).
 */
export const energyLevels = {
  check(d) {
    const odd = Object.keys(d).filter(k => !AL_KEYS.includes(k));
    if (odd.length) return [`an energy level diagram does not take "${odd[0]}"`];
    const out = [];
    if (d.levels !== undefined) {
      if (d.z !== undefined || d.top !== undefined) return ['give "levels" (your own atom, in eV) or "z" and "top" (hydrogen-like), not both'];
      if (!Array.isArray(d.levels) || d.levels.length < 2 || d.levels.length > 8 || d.levels.some(e => !isNum(e, -1000, -0.001))) return ['"levels" lists 2 to 8 energies in eV, each below 0 (0 is ionization)'];
      if (new Set(d.levels).size !== d.levels.length) return ['two levels have the same energy'];
      if (d.series !== undefined) out.push('"series" (Lyman, Balmer, ...) is for hydrogen-like levels');
    } else {
      if (d.z !== undefined && (!Number.isInteger(d.z) || d.z < 1 || d.z > 6)) return ['"z" is the nucleus\'s charge for a one-electron atom: 1 (H) to 6'];
      if (d.top !== undefined && (!Number.isInteger(d.top) || d.top < 2 || d.top > 7)) return ['"top" is the highest level drawn: n = 2 to 7'];
    }
    if (d.height !== undefined && !isNum(d.height, 200, 900)) out.push('"height" is the drawing\'s height in px, 200 to 900');
    if (d.show !== undefined && !['wavelength', 'energy', 'both', 'none'].includes(d.show)) out.push('"show" must be "wavelength", "energy", "both" or "none"');
    if (d.unit !== undefined && !['eV', 'J'].includes(d.unit)) out.push('"unit" must be "eV" or "J"');
    for (const k of ['series', 'ionization']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short title');
    if (out.length) return out;
    const levels = alLevels(d), top = levels.length;
    if (d.cascade !== undefined) {
      if (d.transitions !== undefined) return ['give "transitions" or "cascade", not both'];
      if (!Number.isInteger(d.cascade) || d.cascade < 2 || d.cascade > top) return [`"cascade" is the level the electron falls from: 2 to ${top}`];
    } else if (d.transitions !== undefined) {
      if (!Array.isArray(d.transitions) || d.transitions.length > 10) return ['"transitions" lists up to 10 { from, to }'];
      for (const [i, t] of d.transitions.entries()) {
        const ok = n => Number.isInteger(n) && n >= 1 && n <= top;
        if (!t || typeof t !== 'object' || !ok(t.from) || !(ok(t.to) || t.to === 'inf')) return [`transition ${i + 1}: "from" and "to" are levels 1 to ${top} ("to" can be "inf": ionization)`];
        if (t.from === t.to) return [`transition ${i + 1} goes from a level to itself`];
        if (Object.keys(t).some(k => !['from', 'to'].includes(k))) return [`transition ${i + 1} takes "from" and "to" only`];
      }
      const keys = d.transitions.map(t => `${t.from}>${t.to}`);
      if (new Set(keys).size !== keys.length) return ['a transition is listed twice'];
    }
    if (d.ionization === false && alTransitions(d).some(t => t.to === Infinity)) return ['an ionization arrow needs the n = ∞ line ("ionization" not false)'];
    const { k } = alScale(d, levels);
    for (const t of alTransitions(d)) {
      const E = n => (n === Infinity ? 0 : levels[n - 1].energy), px = Math.abs(E(t.to) - E(t.from)) * k;
      if (px < 14) return [`levels ${t.from} and ${t.to === Infinity ? '∞' : t.to} are ${fmt(px, 1)} px apart at this height, too close for an arrow: make "height" larger, or leave that transition out`];
    }
    return [];
  },
  /** The levels ({ n, energy } in eV), the ionization energy (eV and J), each transition's photon, the first one's
   *  numbers at the top (energy in eV, joules, wavelength in nm, frequency in Hz), and how many lines there are. */
  solve(d) {
    if (energyLevels.check(d).length) return null;
    const levels = alLevels(d), ts = alTransitions(d).map(t => alPhoton(d, levels, t)), first = ts[0];
    return { levels, ionization: -levels[0].energy, ionizationJ: -levels[0].energy * AL_E, transitions: ts, lines: ts.length,
      ...(first ? { energy: first.energy, joules: first.joules, wavelength: first.wavelength, frequency: first.frequency, emission: first.type === 'emission' ? 1 : 0 } : {}) };
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), lang = o.lang, levels = alLevels(d), { lo, k } = alScale(d, levels);
    const ts = alTransitions(d).map(t => alPhoton(d, levels, t)), show = d.show || 'wavelength', unit = d.unit || 'eV';
    const ion = d.ionization !== false, H = alHeight(d), T = d.heading ? 58 : 34, Lx = 150, arrowsW = Math.max(1, ts.length) * 44 + 60, x1 = Lx + Math.max(220, arrowsW), Y = e => T + (e - lo) * k * -1 + H;
    const kids = [], blankLv = o.hide === true || hides(o, 'levels'), blankV = o.hide === true || hides(o, 'values');
    const sup = n => String(n).replace(/-/g, '⁻').replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);
    const eText = e => {
      if (unit !== 'J') return `${alMinus(fmt(e, e > -1 ? 3 : 2, lang))} eV`;
      if (e === 0) return '0 J';
      const j = e * AL_E, x = Math.floor(Math.log10(Math.abs(j)) + 1e-9), m = Math.round((j / 10 ** x) * 100) / 100;
      return Math.abs(m) >= 10 ? `${alMinus(fmt(m / 10, 2, lang))} × 10${sup(x + 1)} J` : `${alMinus(fmt(m, 2, lang))} × 10${sup(x)} J`;
    };
    // the axis
    kids.push(line(36, T + H + 6, 36, T - 14, P.ink, 2), node('polygon', { points: `36,${T - 22} 31,${T - 12} 41,${T - 12}`, fill: P.ink }),
      node('g', { transform: `translate(22 ${r2(T + H / 2)}) rotate(-90)` }, label(0, 0, `${W('energyAxis')} (${unit})`, { anchor: 'middle', size: 13, colour: P.ink })));
    // the levels, exactly at their energies; their labels spread apart where lines are close (each with a leader)
    const rows = [...levels.map(l => ({ y: Y(l.energy), n: String(l.n), e: l.energy })), ...(ion ? [{ y: Y(0), n: '∞', e: 0 }] : [])];
    const tags = rows.map(r => r.y);
    for (let pass = 0; pass < 40; pass++) for (let i = 1; i < tags.length; i++) if (tags[i - 1] - tags[i] < 15) { const m = (tags[i - 1] + tags[i]) / 2; tags[i - 1] = m + 7.5; tags[i] = m - 7.5; }
    rows.forEach((r, i) => {
      kids.push(line(Lx, r2(r.y), x1, r2(r.y), r.n === '∞' ? P.muted : P.ink, r.n === '∞' ? 1.6 : 2.4, { class: 'of-level', ...(r.n === '∞' ? { 'stroke-dasharray': '6 4' } : {}) }));
      const ty = r2(tags[i]);
      if (Math.abs(ty - r.y) > 0.5) kids.push(line(Lx - 4, ty, Lx, r2(r.y), P.muted, 1), line(x1, r2(r.y), x1 + 4, ty, P.muted, 1));
      kids.push(label(Lx - 8, ty, `n = ${r.n}`, { anchor: 'end', size: 12, colour: P.ink, cls: 'of-n' }),
        label(x1 + 8, ty, blankLv && r.n !== '∞' ? '______' : eText(r.e), { size: 12, weight: 600, colour: P.ink2, cls: blankLv && r.n !== '∞' ? 'of-blank' : 'of-energy' }));
    });
    // the transitions, left to right
    ts.forEach((t, i) => {
      const x = Lx + 44 + i * 44, from = Y(t.from === 'inf' ? 0 : levels[t.from - 1].energy), to = Y(t.to === 'inf' ? 0 : levels[t.to - 1].energy);
      const c = o.print ? '#000000' : t.region === 'visible' ? spColor(t.wavelength) : P.ink;
      kids.push(node('g', { class: `of-transition of-${t.type}` }, arrow(x, r2(from), x, r2(to), { colour: c, width: 2.4, head: 9, dash: t.type === 'absorption' ? '6 4' : null })));
      if (show !== 'none') {
        const words = blankV ? ['?'] : show === 'energy' ? [`${fmt(t.energy, 2, lang)} eV`] : show === 'both' ? [`${fmt(t.wavelength, 0, lang)} nm`, `${fmt(t.energy, 2, lang)} eV`] : [`${fmt(t.wavelength, 0, lang)} nm`];
        // along the arrow when it fits; else just below its lower end, reading up
        const long = Math.max(...words.map(w => w.length)) * 6.4, fits = Math.abs(from - to) - 14 >= long, low = Math.max(from, to);
        words.forEach((w, j) => kids.push(node('g', { transform: `translate(${r2(x - 6)} ${r2(fits ? (from + to) / 2 : low + 6 + (d.series ? 22 : 0))}) rotate(-90)` }, label(0, j * 12 - (words.length - 1) * 6, w, { anchor: fits ? 'middle' : 'end', size: 11, weight: 700, colour: P.ink, halo: P.paper, cls: blankV ? 'of-blank' : 'of-value' }))));
      }
    });
    // hydrogen's series, named under their arrows
    if (d.series && ts.length) {
      const names = [...new Set(ts.map(t => t.series).filter(Boolean))];
      names.forEach(sname => {
        const xs = ts.map((t, i) => (t.series === sname ? Lx + 44 + i * 44 : null)).filter(v => v !== null);
        const lowest = Math.max(...ts.filter(t => t.series === sname).map(t => Y(levels[Math.min(t.from, t.to === 'inf' ? 99 : t.to) - 1].energy)));
        kids.push(label((Math.min(...xs) + Math.max(...xs)) / 2, r2(lowest + 14), W(sname), { anchor: 'middle', size: 12, weight: 700, colour: P.ink, halo: P.paper, cls: 'of-series' }));
      });
    }
    if (d.heading) kids.push(label((Lx + x1) / 2, 18, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    const name = d.levels === undefined ? `${W('energyLevels')}: ${AL_ION[(d.z || 1) - 1]}` : W('energyLevels');
    return frame(x1 + 120, T + H + 34, kids, { ...o, kind: 'energyLevels' }, o.title || name);
  },
};

export const LEVEL_KINDS = { energyLevels };
