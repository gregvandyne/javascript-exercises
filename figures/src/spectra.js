// Oomba Figures: spectra (1.2.0, the chemistry pack). A mass spectrum: one peak per isotope at its mass number, as
// tall as its abundance (in %, or against the tallest), from the element's natural isotopes (ported/isotopes.js) or
// isotopes given whose abundances add up to 100; OF.solve gives the relative atomic mass, the peaks' weighted average.
// Line spectra: strips of an element's strongest visible lines (or lines given, or a mixture of other strips), each
// line at its wavelength in its color, bright on black (emission) or dark across a rainbow (absorption); in print,
// black lines on white. A photoelectron spectrum: one peak per sublevel of the atom's ground state (ported/elements.js),
// as tall as its electrons, at its binding energy (ported/spectra.js), on a log or linear axis that grows to the left.
// The checks, the answers and the drawing are Oomba's own, on the core's axes.
import { node, label, line, path, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { axes, axisTitle, niceStep } from './graphs.js';
import { IS_TABLE, isAverage, isHeights, isAbundanceText } from './ported/isotopes.js';
import { SP_LINES, spElementLines, spColor, SP_MJ_PER_EV, SP_MAX_PES_Z, spBinding, spEnergyText } from './ported/spectra.js';
import { EL_SYMBOLS, EL_FILLING, elZ, elAtom } from './ported/elements.js';

/** A number written in English digits ("75.76") in the reader's decimal mark. */
const decimalMark = lang => { try { return new Intl.NumberFormat(/^ar\b/.test(lang) ? 'ar-u-nu-latn' : lang || 'en').format(1.5).replace(/\d/g, ''); } catch (e) { return '.'; } };
const inLang = (s, lang) => String(s).replace('.', decimalMark(lang));

// ---------------------------------------------------------------- mass spectrum
const MS_KEYS = ['kind', 'hide', 'element', 'isotopes', 'name', 'scale', 'values', 'missing', 'x', 'heading'];
/** The peaks, lightest first: [{ mz, mass, abundance }]. */
function msPeaks(d) {
  if (d.element !== undefined) return IS_TABLE[d.element][1].map(([mz, mass, abundance]) => ({ mz, mass, abundance }));
  return d.isotopes.map(i => ({ mz: Math.round(i.mass), mass: i.mass, abundance: i.abundance })).sort((a, b) => a.mass - b.mass);
}
function msRange(d, peaks) {
  if (d.x) return d.x;
  const lo = Math.min(...peaks.map(p => p.mz)), hi = Math.max(...peaks.map(p => p.mz)), span = Math.max(hi - lo + 2, 6);
  const from = Math.max(0, Math.floor((lo + hi - span) / 2));
  return [from, Math.max(from + span, hi + 1)];
}
/**
 * { element: "Cl" (H to Xe but Tc, Pt, Au, Hg, Pb, U: its natural isotopes) } or { isotopes: [{ mass: 35, abundance:
 * 75 }, { mass: 37, abundance: 25 }] (1 to 6, the abundances adding up to 100), name?: "Element X" }, scale?: "percent"
 * | "relative" (the tallest is 100), values?: true (each abundance over its peak), missing?: 37 (that peak left out, to
 * draw), x?: [lo, hi] (the m/z axis). hide: "values", "element" (no name: identify it), true (both).
 */
export const massSpectrum = {
  check(d) {
    const out = [], odd = Object.keys(d).filter(k => !MS_KEYS.includes(k));
    if (odd.length) return [`a mass spectrum does not take "${odd[0]}"`];
    if ((d.element === undefined) === (d.isotopes === undefined)) return ['give "element" (a symbol) or "isotopes" ([{ mass, abundance }]), one of them'];
    if (d.element !== undefined) {
      if (!Object.prototype.hasOwnProperty.call(IS_TABLE, d.element)) return [`"element" must be one with isotope data: ${Object.keys(IS_TABLE).join(', ')}`];
      if (d.name !== undefined) out.push('"name" is for your own isotopes (an element is named by its symbol)');
    } else {
      const I = d.isotopes;
      if (!Array.isArray(I) || !I.length || I.length > 6 || I.some(i => !i || !isNum(i.mass, 1, 300) || !isNum(i.abundance, 1e-6, 100))) return ['"isotopes" lists 1 to 6 { mass (1 to 300), abundance (%, above 0) }'];
      const total = I.reduce((s, i) => s + i.abundance, 0);
      if (Math.abs(total - 100) > 0.01) out.push(`the abundances must add up to 100 (they add up to ${fmt(total, 4)})`);
      const mz = I.map(i => Math.round(i.mass));
      if (new Set(mz).size !== mz.length) out.push('two isotopes have the same mass number: their peaks would be drawn on top of each other');
      if (d.name !== undefined && !text(d.name, 30)) out.push('"name" must be a short name');
    }
    if (d.scale !== undefined && !['percent', 'relative'].includes(d.scale)) out.push('"scale" must be "percent" or "relative"');
    if (d.values !== undefined && typeof d.values !== 'boolean') out.push('"values" must be true or false');
    if (out.length) return out;
    const peaks = msPeaks(d);
    if (d.missing !== undefined && !peaks.some(p => p.mz === d.missing)) out.push(`"missing" must be one of the peaks' m/z (${peaks.map(p => p.mz).join(', ')})`);
    if (d.x !== undefined) {
      const ok = Array.isArray(d.x) && d.x.length === 2 && Number.isInteger(d.x[0]) && Number.isInteger(d.x[1]) && d.x[0] >= 0 && d.x[1] - d.x[0] >= 2 && d.x[1] - d.x[0] <= 60;
      if (!ok) out.push('"x" is the m/z axis [lo, hi]: whole numbers, 2 to 60 apart');
      else if (peaks.some(p => p.mz < d.x[0] || p.mz > d.x[1])) out.push('every peak must be on the m/z axis: widen "x"');
    }
    return out;
  },
  /** The peaks (m/z, exact mass, abundance and drawn height), the relative atomic mass, the most abundant isotope. */
  solve(d) {
    if (massSpectrum.check(d).length) return null;
    const peaks = msPeaks(d), h = isHeights(peaks, d.scale || 'percent'), top = peaks.reduce((a, p) => (p.abundance > a.abundance ? p : a));
    return { peaks: peaks.map((p, i) => ({ ...p, height: h[i] })), mass: isAverage(peaks), total: peaks.reduce((s, p) => s + p.abundance, 0), mostAbundant: top.mz, ...(d.element ? { element: d.element, Z: IS_TABLE[d.element][0] } : {}) };
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), peaks = msPeaks(d), scale = d.scale || 'percent', hts = isHeights(peaks, scale), [lo, hi] = msRange(d, peaks);
    const span = hi - lo, xstep = span <= 16 ? 1 : span <= 30 ? 2 : 5;
    const A = axes([lo, hi], [0, 100], o, { xstep, ystep: 10, xlabel: W('massToCharge'), ylabel: scale === 'percent' ? axisTitle(W('abundance'), '%') : W('relAbundance') });
    const kids = [...A.kids], noValues = o.hide === true || hides(o, 'values') || d.values === false, placed = [];
    peaks.forEach((p, i) => {
      if (p.mz === d.missing) return;
      const x = A.X(p.mz), top = A.Y(hts[i]);
      kids.push(node('rect', { x: r2(x - 5), y: r2(top), width: 10, height: r2(A.Y(0) - top), fill: P.blue, class: 'of-peak' }));
      if (noValues) return;
      const words = `${inLang(scale === 'percent' && d.isotopes ? String(p.abundance) : isAbundanceText(hts[i]), o.lang)}${scale === 'percent' ? '%' : ''}`, w = words.length * 7.2;
      let y = top - 8;
      for (let moved = true; moved;) { moved = false; for (const q of placed) if (Math.abs(q.x - x) < (q.w + w) / 2 + 4 && Math.abs(q.y - y) < 15) { y = q.y - 16; moved = true; } }
      placed.push({ x, y, w });
      kids.push(label(r2(x), r2(y), words, { anchor: 'middle', size: 12, colour: P.ink, halo: P.paper, cls: 'of-abundance' }));
    });
    const name = d.element || text(d.name, 30);
    if (name && !(o.hide === true || hides(o, 'element'))) kids.push(label(A.X(hi) - 4, A.Y(100) + 12, name, { anchor: 'end', size: 16, weight: 800, colour: P.ink, cls: 'of-element' }));
    if (d.heading) kids.push(label(A.w / 2, 12, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    return frame(A.w, A.h, kids, { ...o, kind: 'massSpectrum' }, o.title || W('massSpectrum'));
  },
};

// ---------------------------------------------------------------- line spectra
const LS_KEYS = ['kind', 'hide', 'strips', 'style', 'from', 'to', 'strength', 'heading'];
/** Each strip's lines [{ nm, strength }], shortest first; a mixture has every line of every strip in it. */
function lsLines(d, i, relative) {
  const s = d.strips[i];
  if (s.element !== undefined) return spElementLines(s.element, relative);
  if (s.lines !== undefined) return s.lines.slice().sort((a, b) => a - b).map(nm => ({ nm, strength: 1 }));
  const by = new Map();
  for (const j of s.mix) for (const l of lsLines(d, j, relative)) { const had = by.get(l.nm); if (!had || had.strength < l.strength) by.set(l.nm, l); }
  return [...by.values()].sort((a, b) => a.nm - b.nm);
}
const lsName = s => (s.element !== undefined ? s.element : text(s.name, 20));
/**
 * { strips: [{ element: "H" } | { name: "X", lines: [450, 520.5, 610] } | { name: "Unknown", mix: [0, 2] }] (1 to 8; a
 * mixture's strips by their place in the list, never another mixture), style?: "emission" | "absorption", from?: 380,
 * to?: 750 (nm, the axis), strength?: "uniform" | "relative" (an element's lines as bright as NIST says) }. Elements:
 * H, He, Li, Na, K, Ca, Sr, Ba, Cu, Zn, Cd, Hg, Ne, Ar, Kr. hide: "names" or true (blank lines for the strips'
 * names, to identify them).
 */
export const lineSpectrum = {
  check(d) {
    const odd = Object.keys(d).filter(k => !LS_KEYS.includes(k));
    if (odd.length) return [`a line spectrum does not take "${odd[0]}"`];
    const out = [], S = d.strips;
    if (!Array.isArray(S) || !S.length || S.length > 8) return ['"strips" lists 1 to 8 strips: { element }, { name, lines } or { name, mix }'];
    const from = d.from ?? 380, to = d.to ?? 750;
    if (!isNum(from, 100, 1990) || !isNum(to, from + 10, 2000)) return ['"from" and "to" (nm) must be from 100 to 2000, from below to'];
    S.forEach((s, i) => {
      const at = `strip ${i + 1}`;
      if (!s || typeof s !== 'object') { out.push(`${at} must be { element }, { name, lines } or { name, mix }`); return; }
      const ways = ['element', 'lines', 'mix'].filter(k => s[k] !== undefined);
      if (ways.length !== 1) { out.push(`${at} must be { element }, { name, lines } or { name, mix }, one of them`); return; }
      if (s.element !== undefined && !Object.prototype.hasOwnProperty.call(SP_LINES, s.element)) out.push(`${at}: "element" must be one of ${Object.keys(SP_LINES).join(', ')}`);
      if (s.lines !== undefined && (!Array.isArray(s.lines) || !s.lines.length || s.lines.length > 30 || s.lines.some(nm => !isNum(nm, 100, 2000)) || new Set(s.lines).size !== s.lines.length)) out.push(`${at}: "lines" lists 1 to 30 different wavelengths in nm`);
      if (s.mix !== undefined && (!Array.isArray(s.mix) || s.mix.length < 2 || s.mix.some(j => !Number.isInteger(j) || j < 0 || j >= S.length || j === i || (S[j] && S[j].mix !== undefined)))) out.push(`${at}: "mix" lists 2 or more other strips (by their place in the list, from 0), never a mixture`);
      if (s.element === undefined && !text(s.name, 20)) out.push(`${at} needs a short "name"`);
      if (s.element !== undefined && s.name !== undefined) out.push(`${at}: an element strip is named by its symbol`);
    });
    if (d.style !== undefined && !['emission', 'absorption'].includes(d.style)) out.push('"style" must be "emission" or "absorption"');
    if (d.strength !== undefined && !['uniform', 'relative'].includes(d.strength)) out.push('"strength" must be "uniform" or "relative"');
    if (out.length) return out;
    S.forEach((s, i) => { const off = lsLines(d, i, false).filter(l => l.nm < from || l.nm > to); if (off.length) out.push(`strip ${i + 1}: the line at ${off[0].nm} nm is off the axis (${from} to ${to} nm): widen "from" and "to"`); });
    return out;
  },
  /** Each strip's name and wavelengths (nm), and each mixture's parts. */
  solve(d) {
    if (lineSpectrum.check(d).length) return null;
    return { strips: d.strips.map((s, i) => ({ name: lsName(s), lines: lsLines(d, i, false).map(l => l.nm), ...(s.mix ? { mix: s.mix.map(j => lsName(d.strips[j])) } : {}) })) };
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), from = d.from ?? 380, to = d.to ?? 750, abs = d.style === 'absorption', relative = d.strength === 'relative';
    const L = 96, w = 520, sh = 40, gap = 14, T = d.heading ? 34 : 14, X = nm => L + ((nm - from) / (to - from)) * w, kids = [], blank = o.hide === true || hides(o, 'names');
    if (abs && !o.print) {
      const id = `of-rainbow-${Math.round(from)}-${Math.round(to)}`, stops = [];
      for (let k = 0; k <= 24; k++) { const nm = from + ((to - from) * k) / 24; stops.push(node('stop', { offset: `${r2((k / 24) * 100)}%`, 'stop-color': spColor(nm) })); }
      kids.push(node('defs', {}, node('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 0 }, stops)));
    }
    d.strips.forEach((s, i) => {
      const y = T + i * (sh + gap), bg = o.print ? '#FFFFFF' : abs ? `url(#of-rainbow-${Math.round(from)}-${Math.round(to)})` : '#000000';
      kids.push(node('rect', { x: L, y, width: w, height: sh, fill: bg, stroke: P.ink, 'stroke-width': 1.4 }));
      for (const l of lsLines(d, i, relative)) {
        const c = o.print ? '#000000' : abs ? '#000000' : spColor(l.nm);
        kids.push(line(X(l.nm), y + 1, X(l.nm), y + sh - 1, c, 2.6, { 'stroke-opacity': r2(l.strength), 'stroke-linecap': 'butt', class: 'of-line' }));
      }
      kids.push(label(L - 10, y + sh / 2, blank ? '________' : lsName(s), { anchor: 'end', size: 14, weight: 700, colour: P.ink, cls: 'of-name' }));
    });
    const yA = T + d.strips.length * (sh + gap) - gap, step = niceStep(to - from, 8);
    kids.push(line(L, yA, L + w, yA, P.ink, 1.6));
    for (let nm = Math.ceil(from / step) * step; nm <= to + 1e-9; nm += step) kids.push(line(X(nm), yA, X(nm), yA + 6, P.ink, 1.4), label(X(nm), yA + 17, fmt(nm, 1, o.lang), { anchor: 'middle', size: 12, weight: 600, colour: P.ink2 }));
    kids.push(label(L + w / 2, yA + 40, axisTitle(W('wavelength'), 'nm'), { anchor: 'middle', size: 13, colour: P.ink }));
    if (d.heading) kids.push(label(L + w / 2, 14, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    return frame(L + w + 24, yA + 56, kids, { ...o, kind: 'lineSpectrum' }, o.title || W('lineSpectrum'));
  },
};

// ---------------------------------------------------------------- photoelectron spectra
const PES_KEYS = ['kind', 'hide', 'element', 'compare', 'unit', 'scale', 'sublevels', 'energies', 'heading'];
/** An atom's peaks, highest binding energy first: [{ sublevel, electrons, energy (in the unit) }]. */
function pesPeaks(z, unit) {
  const c = elAtom(z), E = spBinding(z);
  return EL_FILLING.filter(s => c[s.name] && E[s.name]).map(s => ({ sublevel: s.name, electrons: c[s.name], energy: unit === 'eV' ? E[s.name] / SP_MJ_PER_EV : E[s.name] })).sort((a, b) => b.energy - a.energy);
}
/**
 * { element: "Na" | 11 (H to Xe), compare?: "Mg" (a second element, dashed behind), unit?: "MJ/mol" | "eV", scale?:
 * "log" | "linear" (binding energy grows to the left, as spectra are drawn), sublevels?: true (each peak's sublevel),
 * energies?: false (each peak's binding energy) }. hide: "sublevels" (blank lines), "element" (no names: identify it),
 * true (both).
 */
export const photoelectron = {
  check(d) {
    const odd = Object.keys(d).filter(k => !PES_KEYS.includes(k));
    if (odd.length) return [`a photoelectron spectrum does not take "${odd[0]}"`];
    const out = [], z = elZ(d.element);
    if (!z || z > SP_MAX_PES_Z) return [`"element" must be H to Xe (1 to ${SP_MAX_PES_Z}): binding energies are known for those`];
    if (d.compare !== undefined) { const c = elZ(d.compare); if (!c || c > SP_MAX_PES_Z || c === z) out.push('"compare" must be another element, H to Xe'); }
    if (d.unit !== undefined && !['MJ/mol', 'eV'].includes(d.unit)) out.push('"unit" must be "MJ/mol" or "eV"');
    if (d.scale !== undefined && !['log', 'linear'].includes(d.scale)) out.push('"scale" must be "log" or "linear"');
    for (const k of ['sublevels', 'energies']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
    return out;
  },
  /** The peaks (sublevel, electrons, binding energy), highest energy first, for the element (and the one compared). */
  solve(d) {
    if (photoelectron.check(d).length) return null;
    const unit = d.unit || 'MJ/mol', z = elZ(d.element), peaks = pesPeaks(z, unit), out = { element: EL_SYMBOLS[z], Z: z, unit, peaks, electrons: peaks.reduce((s, p) => s + p.electrons, 0), lowest: peaks[peaks.length - 1].energy };
    if (d.compare !== undefined) out.compare = { element: EL_SYMBOLS[elZ(d.compare)], peaks: pesPeaks(elZ(d.compare), unit) };
    return out;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), unit = d.unit || 'MJ/mol', z = elZ(d.element), sets = [pesPeaks(z, unit), ...(d.compare !== undefined ? [pesPeaks(elZ(d.compare), unit)] : [])];
    const all = sets.flat(), Emax = Math.max(...all.map(p => p.energy)), Emin = Math.min(...all.map(p => p.energy)), log = (d.scale || 'log') === 'log';
    const Lm = 64, T = 40, w = 460, h = 240, top = Math.max(...all.map(p => p.electrons));
    const a = Math.floor(Math.log10(Emin)), b = Math.ceil(Math.log10(Emax) + 1e-9), lin = niceStep(Emax, 6), linEnd = Math.ceil((Emax * 1.05) / lin) * lin;
    const X = E => (log ? Lm + w * (1 - (Math.log10(E) - a) / (b - a)) : Lm + w * (1 - E / linEnd)), Y = n => T + h - (n / (top + 1)) * h;
    const kids = [], noSub = o.hide === true || hides(o, 'sublevels') || d.sublevels === false, noName = o.hide === true || hides(o, 'element');
    for (let n = 0; n <= top + 1; n += top > 6 ? 2 : 1) kids.push(line(Lm, Y(n), Lm + w, Y(n), P.grid, 1), label(Lm - 8, Y(n), fmt(n, 0, o.lang), { anchor: 'end', size: 12, weight: 600, colour: P.ink2 }));
    const ticks = log ? Array.from({ length: b - a + 1 }, (_, k) => 10 ** (a + k)) : Array.from({ length: Math.round(linEnd / lin) + 1 }, (_, k) => k * lin);
    for (const E of ticks) kids.push(line(X(E), T + h, X(E), T + h + 6, P.ink, 1.4), label(X(E), T + h + 18, fmt(E, 3, o.lang), { anchor: 'middle', size: 12, weight: 600, colour: P.ink2 }));
    kids.push(line(Lm, T + h, Lm + w, T + h, P.ink, 2), line(Lm, T + h, Lm, T - 6, P.ink, 2),
      label(Lm + w / 2, T + h + 42, `${axisTitle(W('bindingEnergy'), unit)}${log ? ` (${W('logScale')})` : ''}`, { anchor: 'middle', size: 13, colour: P.ink }),
      node('g', { transform: `translate(16 ${T + h / 2}) rotate(-90)` }, label(0, 0, W('electronsRel'), { anchor: 'middle', size: 13, colour: P.ink })));
    // each peak a narrow bell exactly at its energy, exactly as tall as its electrons; the compared element dashed behind
    sets.slice().reverse().forEach((peaks, k) => {
      const second = sets.length === 2 && k === 0;
      for (const p of peaks) {
        const x = X(p.energy), pts = [];
        for (let t = -3; t <= 3; t += 0.25) pts.push(`${r2(x + t * 4)},${r2(Y(p.electrons * Math.exp(-t * t / 2)))}`);
        kids.push(path(`M ${pts.join(' L ')}`, { stroke: second ? P.red : P.blue, 'stroke-width': second ? 2 : 2.6, 'stroke-dasharray': second ? '5 4' : null, class: second ? 'of-compare' : 'of-peak' }));
      }
    });
    sets[0].forEach(p => {
      if (!noSub) kids.push(label(X(p.energy), Y(p.electrons) - 12, p.sublevel, { anchor: 'middle', size: 12, colour: P.ink, halo: P.paper, cls: 'of-sublevel' }));
      else if (hides(o, 'sublevels') || o.hide === true) kids.push(label(X(p.energy), Y(p.electrons) - 12, '____', { anchor: 'middle', size: 12, colour: P.ink }));
      if (d.energies) kids.push(label(X(p.energy), Y(p.electrons) - 26, inLang(spEnergyText(p.energy), o.lang), { anchor: 'middle', size: 11, colour: P.ink2, halo: P.paper }));
    });
    const names = [EL_SYMBOLS[z], ...(d.compare !== undefined ? [EL_SYMBOLS[elZ(d.compare)]] : [])];
    names.forEach((n, k) => kids.push(line(Lm + w - 70, T - 22 + k * 16, Lm + w - 46, T - 22 + k * 16, k ? P.red : P.blue, 2.6, { 'stroke-dasharray': k ? '5 4' : null }), label(Lm + w - 40, T - 22 + k * 16, noName ? `${W('element')} ${'AB'[k]}` : n, { size: 12, weight: 700, colour: P.ink, cls: 'of-element' })));
    if (d.heading) kids.push(label(Lm + w / 2, 12, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    return frame(Lm + w + 24, T + h + 60, kids, { ...o, kind: 'photoelectron' }, o.title || W('photoelectron'));
  },
};

export const SPECTRA_KINDS = { massSpectrum, lineSpectrum, photoelectron };
