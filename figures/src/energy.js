// Oomba Figures: energy in chemistry (1.2.0, the chemistry pack). A heating or cooling curve drawn to scale from the
// substance's properties (each segment's length is the heat it takes, or the time at a steady rate: ported/heating.js),
// and a potential energy diagram (a reaction energy profile) whose peaks and dips are exactly the levels' energies,
// with Ea, ΔH and a catalyzed path worked out from them (ported/profile.js). The checks, the answers (OF.solve) and the
// drawing are Oomba's own; the axes are the core's.
import { node, label, subLabel, line, poly, arrow, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { axes, axisTitle, niceStep } from './graphs.js';
import { HC_SUBSTANCES, hcSegments, hcHeat, hcPlace, hcPoints, hcNiceRange, hcPlateau } from './ported/heating.js';
import { peIsCount, peKindOf, peSteps, peDeltaH, peRateStep, peCatalyzed, pePlacement, peLevelXs, pePoints } from './ported/profile.js';

const minus = s => String(s).replace(/^-/, '−');
const enNum = (x, dp, lang) => minus(fmt(x, dp, lang));

// ---------------------------------------------------------------- heating and cooling curves
const HC_PROPS = ['mp', 'bp', 'cSolid', 'cLiquid', 'cGas', 'fusH', 'vapH', 'molarMass'];
const HC_KEYS = ['kind', 'hide', 'substance', ...HC_PROPS, 'from', 'to', 'mass', 'x', 'rate', 'supercool', 'labels', 'marks', 'heading'];
/** The substance's properties (a ready one, or the data's own) and the run. */
function hcOf(d) {
  const p = d.substance !== undefined ? HC_SUBSTANCES[d.substance] : Object.fromEntries(HC_PROPS.map(k => [k, d[k]]));
  const from = d.from ?? (d.substance !== undefined ? p.from : undefined), to = d.to ?? (d.substance !== undefined ? p.to : undefined);
  return { p, from, to, dir: to > from ? 'heating' : 'cooling', mass: d.mass ?? 100, rate: d.rate ?? 10, x: d.x || 'time' };
}
function hcBuild(d) {
  const c = hcOf(d), segs = hcSegments(c.dir, { startT: c.from, endT: c.to, mp: c.p.mp, bp: c.p.bp });
  const heat = segs.map(s => hcHeat(s, c.mass, c.p)), per = c.x === 'time' ? c.rate : 1;
  const placed = hcPlace(segs, s => hcHeat(s, c.mass, c.p) / per);
  return { ...c, segs, heat, placed, points: hcPoints(placed, d.supercool || 0), total: heat.reduce((a, b) => a + b, 0) };
}
/**
 * { substance: "water" | "ethanol" | "acetone" | "mercury" | "sodiumChloride" | "x" (or your own: mp, bp in °C; cSolid,
 * cLiquid, cGas in J/(g °C); fusH, vapH in kJ/mol; molarMass in g/mol), from, to (°C; heating when to is hotter,
 * cooling when colder; the substance's usual run by default), mass?: 100 (g), x?: "time" (at rate kJ/min, 10 by
 * default) | "heat" (kJ added or removed), supercool?: °C (a cooling curve dips below its freezing point first), labels?:
 * true (each segment's state, each plateau's change), marks?: true (dashed lines at the plateaus' temperatures) }.
 * hide: true or "states" (blank lines for the labels), "points" (the plateaus' temperatures blank).
 */
export const heatingCurve = {
  check(d) {
    const out = [], odd = Object.keys(d).filter(k => !HC_KEYS.includes(k));
    if (odd.length) return [`a heating curve does not take "${odd[0]}"`];
    if (d.substance !== undefined) {
      if (!Object.prototype.hasOwnProperty.call(HC_SUBSTANCES, d.substance)) return [`"substance" must be one of ${Object.keys(HC_SUBSTANCES).join(', ')} (or give your own mp, bp, cSolid, cLiquid, cGas, fusH, vapH and molarMass)`];
      if (HC_PROPS.some(k => d[k] !== undefined)) return ['give a ready "substance" or your own properties, not both'];
    } else {
      for (const k of HC_PROPS) if (k === 'mp' || k === 'bp' ? !isNum(d[k], -273.15, 5000) : !isNum(d[k], 1e-6, 100000)) out.push(`"${k}" must be ${k === 'mp' || k === 'bp' ? 'a temperature in °C' : 'a number above 0'} (your own substance needs mp, bp, cSolid, cLiquid, cGas, fusH, vapH and molarMass)`);
      if (!out.length && d.bp <= d.mp) out.push('the boiling point ("bp") must be above the melting point ("mp")');
      if (out.length) return out;
      if (d.from === undefined || d.to === undefined) return ['your own substance needs "from" and "to" (°C)'];
    }
    const c = hcOf(d);
    if (!isNum(c.from, -273.15, 5000) || !isNum(c.to, -273.15, 5000)) return ['"from" and "to" must be temperatures in °C, above absolute zero'];
    if (c.from === c.to) return ['"from" and "to" must differ (to above from heats, to below from cools)'];
    if (d.mass !== undefined && !isNum(d.mass, 0.001, 100000)) out.push('"mass" must be the sample\'s mass in grams, above 0');
    if (d.x !== undefined && !['time', 'heat'].includes(d.x)) out.push('"x" must be "time" or "heat"');
    if (d.rate !== undefined && (!isNum(d.rate, 1e-6, 1e6) || c.x !== 'time')) out.push('"rate" (kJ per minute, above 0) goes with "x": "time"');
    for (const k of ['labels', 'marks']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
    if (out.length) return out;
    if (d.supercool !== undefined) {
      const b = hcBuild({ ...d, supercool: 0 }), i = b.placed.findIndex(s => s.key === 'melt');
      if (c.dir !== 'cooling' || i < 1 || b.placed[i - 1].key !== 'liquid') out.push('"supercool" is for a cooling curve that freezes (it runs from a liquid down past its freezing point)');
      else if (!isNum(d.supercool, 1e-6, c.p.mp - Math.min(c.from, c.to))) out.push(`"supercool" (how far the liquid dips below its freezing point, °C) must be above 0 and stay above the curve's lowest temperature (at most ${fmt(c.p.mp - Math.min(c.from, c.to), 2)})`);
    }
    return out;
  },
  /** Each segment's state, temperatures, heat (kJ) and time (min), the totals, and the plateaus' heats. */
  solve(d) {
    if (heatingCurve.check(d).length) return null;
    const b = hcBuild(d), segs = b.segs.map((s, i) => ({ state: s.key, from: s.t0, to: s.t1, heat: b.heat[i], ...(b.x === 'time' ? { time: b.heat[i] / b.rate } : {}) }));
    const of = k => { const s = segs.find(x => x.state === k); return s ? s.heat : 0; };
    return { direction: b.dir, mp: b.p.mp, bp: b.p.bp, mass: b.mass, segments: segs, heat: b.total, ...(b.x === 'time' ? { time: b.total / b.rate, rate: b.rate } : {}), melt: of('melt'), boil: of('boil') };
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), b = hcBuild(d), lang = o.lang;
    const end = b.placed.length ? b.placed[b.placed.length - 1].x0 + b.placed[b.placed.length - 1].width : 1;
    const ys = b.points.map(p => p.y), [x0, x1, xs] = hcNiceRange(0, end, true), [y0, y1, yst] = hcNiceRange(Math.min(...ys), Math.max(...ys));
    const xt = b.x === 'time' ? axisTitle(W('time'), 'min') : axisTitle(W(b.dir === 'heating' ? 'heatAdded' : 'heatRemoved'), 'kJ');
    const A = axes([x0, x1], [y0, y1], o, { xstep: xs, ystep: yst, xlabel: xt, ylabel: axisTitle(W('temperature'), '°C') });
    const kids = [...A.kids], blankStates = o.hide === true || hides(o, 'states'), blankPoints = hides(o, 'points');
    if (d.marks !== false) for (const s of b.placed.filter(s => hcPlateau(s.key))) {
      const y = A.Y(s.t0);
      kids.push(line(A.X(0), y, A.X(s.x0), y, P.muted, 1.4, { 'stroke-dasharray': '5 4' }), label(A.X(0) + 6, y - 9, blankPoints ? '_____ °C' : `${enNum(s.t0, 1, lang)} °C`, { size: 12, colour: P.ink2, halo: P.paper, cls: 'of-point' }));
    }
    kids.push(poly(b.points.map(p => [A.X(p.x), A.Y(p.y)]), { stroke: P.red, 'stroke-width': 3.2, class: 'of-curve' }));
    if (d.labels !== false) for (const s of b.placed) {
      if (s.width <= 0) continue;
      const name = hcPlateau(s.key) ? W(b.dir === 'heating' ? (s.key === 'melt' ? 'melting' : 'boiling') : (s.key === 'melt' ? 'freezing' : 'condensing')) : W(s.key);
      const mx = A.X(s.x0 + s.width / 2), my = A.Y((s.t0 + s.t1) / 2), flat = hcPlateau(s.key);
      const up = b.dir === 'heating';
      kids.push(label(r2(flat ? mx : mx + (up ? -8 : 8)), r2(flat ? my - 12 : my - 8), blankStates ? '________' : name, { anchor: flat ? 'middle' : up ? 'end' : 'start', size: 12, colour: P.ink, halo: P.paper, cls: 'of-state' }));
    }
    if (d.heading) kids.push(label(A.w / 2, 12, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    return frame(A.w, A.h, kids, { ...o, kind: 'heatingCurve' }, o.title || W(b.dir === 'heating' ? 'heatingCurve' : 'coolingCurve'));
  },
};

// ---------------------------------------------------------------- potential energy diagrams
const PE_KEYS = ['kind', 'hide', 'levels', 'catalyst', 'unit', 'style', 'arrows', 'names', 'heading'];
const PE_UNITS = ['kJ/mol', 'kJ mol⁻¹', 'kJ'];
const PE_ARROWS = ['ea', 'dh', 'eaReverse', 'catEa'];
const peArrowsOf = d => d.arrows || (d.catalyst !== undefined ? ['ea', 'dh', 'catEa'] : ['ea', 'dh']);
/**
 * { levels: [50, 150, 20] (kJ/mol, in order: reactants, a transition state, and for each further step an intermediate
 * and its transition state, then the products: 3, 5 or 7), catalyst?: 100 (the catalyzed path's one transition state),
 * unit?: "kJ/mol", style?: "curve" | "levels" (an energy level diagram: the reactants and products as lines, ΔH
 * between), arrows?: ["ea", "dh"] (also "eaReverse", "catEa"; every step gets its Ea), names?: { reactants, products } }.
 * hide: "values" (the arrows say Ea and ΔH only), true or "arrows" (no arrows, for the student to draw).
 */
export const energyProfile = {
  check(d) {
    const out = [], odd = Object.keys(d).filter(k => !PE_KEYS.includes(k));
    if (odd.length) return [`a potential energy diagram does not take "${odd[0]}"`];
    const L = d.levels;
    if (!Array.isArray(L) || !peIsCount(L.length) || L.some(e => !isNum(e, -100000, 100000))) return ['"levels" must list 3, 5 or 7 energies (reactants, transition state, [intermediate, transition state, ...] products)'];
    L.forEach((e, i) => { if (peKindOf(i, L.length) === 'ts' && !(e > L[i - 1] && e > L[i + 1])) out.push(`level ${i + 1} is a transition state: it must be above the levels either side of it (a peak)`); });
    if (d.catalyst !== undefined) {
      const top = Math.max(...peSteps(L).map(s => s.ts));
      if (!isNum(d.catalyst, -100000, 100000)) out.push('"catalyst" must be the catalyzed transition state\'s energy');
      else if (!(d.catalyst < top)) out.push(`a catalyst lowers the way over: "catalyst" (${d.catalyst}) must be below the highest transition state (${top})`);
      else if (!(d.catalyst > L[0] && d.catalyst > L[L.length - 1])) out.push('the catalyzed transition state must still be above the reactants and the products');
    }
    if (d.unit !== undefined && !PE_UNITS.includes(d.unit)) out.push(`"unit" must be ${PE_UNITS.join(', ')}`);
    if (d.style !== undefined && !['curve', 'levels'].includes(d.style)) out.push('"style" must be "curve" or "levels"');
    if (d.arrows !== undefined && (!Array.isArray(d.arrows) || d.arrows.some(a => !PE_ARROWS.includes(a)))) out.push(`"arrows" lists ${PE_ARROWS.join(', ')}`);
    else if (d.arrows && d.arrows.includes('catEa') && d.catalyst === undefined) out.push('"catEa" needs a "catalyst"');
    if (d.style === 'levels' && d.arrows && d.arrows.some(a => a !== 'dh')) out.push('a level diagram shows ΔH only: "arrows" can only be ["dh"]');
    if (d.names !== undefined && (!d.names || typeof d.names !== 'object' || Object.keys(d.names).some(k => !['reactants', 'products'].includes(k)))) out.push('"names" is { reactants, products }');
    return out;
  },
  /** ΔH, each step's forward and reverse Ea, the rate-determining step, and the catalyzed Ea. */
  solve(d) {
    if (energyProfile.check(d).length) return null;
    const L = d.levels, steps = peSteps(L), dH = peDeltaH(L), out = { dH, exothermic: dH < 0, steps: steps.map(s => ({ ea: s.ea, eaReverse: s.eaReverse })), ea: steps[0].ea, eaReverse: steps[steps.length - 1].eaReverse, rateStep: peRateStep(L), unit: d.unit || 'kJ/mol' };
    if (L.length > 3) out.eaOverall = Math.max(...steps.map(s => s.ts)) - L[0];
    if (d.catalyst !== undefined) Object.assign(out, { catEa: d.catalyst - L[0], catEaReverse: d.catalyst - L[L.length - 1], lowered: Math.max(...steps.map(s => s.ts)) - d.catalyst });
    return out;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), lang = o.lang, L = d.levels, unit = d.unit || 'kJ/mol', levelsOnly = d.style === 'levels';
    const all = [...L, ...(d.catalyst !== undefined ? [d.catalyst] : [])], lo = Math.min(...all), hi = Math.max(...all), step = niceStep(hi - lo || 10, 6);
    const y0 = lo >= 0 && lo <= 0.6 * (hi - lo) ? 0 : Math.floor((lo - 0.15 * (hi - lo)) / step) * step, y1 = Math.ceil((hi + 0.12 * (hi - lo)) / step) * step;
    const Lm = 70, T = 30, w = 440, h = 280, p = pePlacement(levelsOnly ? 1 : (L.length - 1) / 2), X = b => Lm + (b / p.width) * w, Y = e => T + h - ((e - y0) / (y1 - y0)) * h;
    const kids = [];
    // the energy axis, numbered with light gridlines; the reaction coordinate has no numbers
    for (let e = y0; e <= y1 + step * 1e-6; e += step) {
      const v = Math.round(e / step) * step;
      kids.push(line(Lm, Y(v), Lm + w, Y(v), P.grid, 1), line(Lm - 4, Y(v), Lm, Y(v), P.ink, 1.5), label(Lm - 8, Y(v), enNum(v, 3, lang), { anchor: 'end', size: 12, weight: 600, colour: P.ink2 }));
    }
    kids.push(line(Lm, T + h, Lm + w + 8, T + h, P.ink, 2), line(Lm, T + h, Lm, T - 8, P.ink, 2),
      node('polygon', { points: `${Lm + w + 14},${T + h} ${Lm + w + 4},${T + h - 5} ${Lm + w + 4},${T + h + 5}`, fill: P.ink }), node('polygon', { points: `${Lm},${T - 14} ${Lm - 5},${T - 4} ${Lm + 5},${T - 4}`, fill: P.ink }),
      label(Lm + w / 2, T + h + 22, W('reactionCoordinate'), { anchor: 'middle', size: 13, colour: P.ink }),
      node('g', { transform: `translate(16 ${T + h / 2}) rotate(-90)` }, label(0, 0, axisTitle(W('potentialEnergy'), unit), { anchor: 'middle', size: 13, colour: P.ink })));
    const xs = peLevelXs(L, p), names = d.names || {}, E0 = L[0], E1 = L[L.length - 1];
    if (levelsOnly) {
      kids.push(line(X(0.5), Y(E0), X(p.start + 2), Y(E0), P.blue, 4, { class: 'of-level' }), line(X(p.end - 2), Y(E1), X(p.width - 0.5), Y(E1), P.blue, 4, { class: 'of-level' }));
    } else {
      kids.push(poly(pePoints(L, p).map(q => [X(q.x), Y(q.y)]), { stroke: P.blue, 'stroke-width': 3.2, class: 'of-curve' }));
      if (d.catalyst !== undefined) kids.push(poly(pePoints(peCatalyzed(L, d.catalyst), p).map(q => [X(q.x), Y(q.y)]), { stroke: P.red, 'stroke-width': 2.6, 'stroke-dasharray': '8 6', class: 'of-catalyzed' }));
    }
    // the names under their levels (above is where the arrows go)
    kids.push(label(X(xs[0]), Y(E0) + 14, text(names.reactants, 30) || W('reactants'), { anchor: 'middle', size: 13, colour: P.ink, halo: P.paper, cls: 'of-name' }),
      label(X(xs[xs.length - 1]), Y(E1) + 14, text(names.products, 30) || W('products'), { anchor: 'middle', size: 13, colour: P.ink, halo: P.paper, cls: 'of-name' }));
    const noArrows = o.hide === true || hides(o, 'arrows'), noValues = hides(o, 'values'), want = levelsOnly ? (d.arrows || ['dh']) : peArrowsOf(d);
    const say = (sym, sub, v, x, y, anchor, colour, note) => subLabel(x, y, sym, sub, { size: 13, anchor, colour, halo: P.paper, after: `${note ? ` (${note})` : ''}${noValues ? '' : ` = ${enNum(v, 3, lang)} ${unit}`}` });
    const up = (x, from, to, colour, dash) => [line(x - 28, Y(from), x + 6, Y(from), colour, 1.2, { 'stroke-dasharray': '4 4' }), arrow(x, Y(from), x, Y(to), { colour, width: 2, head: 9, dash })];
    if (!noArrows) {
      if (!levelsOnly && want.includes('ea')) peSteps(L).forEach(s => {
        const x = X(xs[s.index]) - 16;
        kids.push(...up(x, s.before, s.ts, P.green), say('E', 'a', s.ea, x - 6, Y((s.before + s.ts) / 2), 'end', P.green));
      });
      if (!levelsOnly && want.includes('eaReverse')) { const s = peSteps(L)[peSteps(L).length - 1], x = X(xs[s.index]) + 16; kids.push(...up(x, s.after, s.ts, P.purple), say('E', 'a', s.eaReverse, x + 6, Y((s.after + s.ts) / 2), 'start', P.purple, W('reverse'))); }
      if (!levelsOnly && want.includes('catEa') && d.catalyst !== undefined) { const x = X(xs[1] ?? p.start + p.half) + 16; kids.push(...up(x, E0, d.catalyst, P.red, '6 4'), say('E', 'a', d.catalyst - E0, x + 6, Y((E0 + d.catalyst) / 2), 'start', P.red, W('catalyzed'))); }
      if (want.includes('dh')) {
        const x = X(levelsOnly ? (p.start + p.end) / 2 + 1 : p.end + 0.8);
        kids.push(line(X(levelsOnly ? p.start + 2 : xs[0]), Y(E0), x + 6, Y(E0), P.ink2, 1.2, { 'stroke-dasharray': '4 4' }), arrow(x, Y(E0), x, Y(E1), { colour: P.ink, width: 2, head: 9 }), say('ΔH', '', E1 - E0, x + 8, Y((E0 + E1) / 2), 'start', P.ink));
      }
    }
    if (d.catalyst !== undefined && !levelsOnly) kids.push(line(Lm + w - 150, T + 4, Lm + w - 126, T + 4, P.blue, 3), label(Lm + w - 120, T + 4, W('uncatalyzed'), { size: 12, colour: P.ink }),
      line(Lm + w - 150, T + 22, Lm + w - 126, T + 22, P.red, 2.6, { 'stroke-dasharray': '6 4' }), label(Lm + w - 120, T + 22, W('catalyzed'), { size: 12, colour: P.ink }));
    if (d.heading) kids.push(label(Lm + w / 2, 12, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    return frame(Lm + w + 90, T + h + 40, kids, { ...o, kind: 'energyProfile' }, o.title || W('energyProfile'));
  },
};

export const ENERGY_KINDS = { heatingCurve, energyProfile };
