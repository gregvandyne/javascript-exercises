// Oomba Figures: rate graphs (1.3.0, the biology pack). Enzyme activity: the rate of reaction against temperature (it
// doubles every width degrees, then the enzyme denatures past its optimum), pH (a bell either side of the optimum) or
// substrate concentration (Michaelis-Menten, with a competitive or non-competitive inhibitor), for up to three enzymes.
// Photosynthesis: the rate against light intensity (or the lamp's distance), CO2 concentration or temperature, each
// curve at its own fixed values of the other two, so the limiting factors show (the rise, the plateau, and which factor
// sets the plateau). Every point comes from the models (ported/rates.js); the checks, the answers (OF.solve) and the
// drawing are Oomba's own, on the core's axes, with "shape" axes (no numbers) or numbered ones. In print the curves are
// told apart by solid, dashed and dotted lines and their names.
import { node, label, line, poly, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { axes, axisTitle, niceStep } from './graphs.js';
import { enRateAtTemperature, enDenaturedAbove, enRateAtPH, EN_INHIBITORS, enKinetics, enRateAtSubstrate, EN_ENZYMES, psGross, psNet, psRespiration, psIntensityAt, psLightPlateau, psCo2Plateau, psLightSaturation, psCo2Saturation, psLightCompensation, psFastestAt, PS_DENATURED_AT } from './ported/rates.js';

const rateOdd = (d, keys, what) => { const k = Object.keys(d).find(x => !keys.includes(x)); return k ? [`${what} does not take "${k}"`] : []; };
const DASHES = [null, '9 6', '2.5 5'];
const rateRange = (r, lo, hi) => Array.isArray(r) && r.length === 2 && isNum(r[0], lo, hi) && isNum(r[1], lo, hi) && r[1] > r[0];
const niceTop = (v, n = 6) => { const s = niceStep(v > 0 ? v : 1, n); return { top: Math.ceil(v / s - 1e-9) * s || s, step: s }; };
/** One rate graph: the curves as functions of x, on axes from xr; shape: no numbers on the axes. -> the figure. */
function rateGraph(d, o, { kind, name, xr, yTop, yLo = 0, xtitle, ytitle, curves, marks, shape, xstep }) {
  const P = palette(o), Y = niceTop(yTop, 5), lo = yLo < 0 ? -niceTop(-yLo, 3).top : 0;
  const blank = () => '';
  const A = axes(xr, [lo, Y.top], o, { w: 420, h: 260, xstep: xstep || niceStep(xr[1] - xr[0], 8), ystep: lo < 0 ? niceStep(Y.top - lo, 6) : Y.step, xlabel: xtitle, ylabel: ytitle, ...(shape ? { xfmt: blank, yfmt: blank } : {}) });
  const kids = [...A.kids], hideAll = o.hide === true;
  if (lo < 0) kids.push(line(A.X(xr[0]), A.Y(0), A.X(xr[1]), A.Y(0), P.ink, 1.4));
  const colours = [P.green, P.blue, P.red];
  if (!hideAll && !hides(o, 'curves')) curves.forEach((c, i) => {
    const pts = [];
    for (let k = 0; k <= 300; k++) { const x = xr[0] + ((xr[1] - xr[0]) * k) / 300, v = c.f(x); pts.push([A.X(x), A.Y(Math.max(lo, Math.min(Y.top, v)))]); }
    kids.push(poly(pts, { stroke: colours[i], 'stroke-width': 3.2, 'stroke-dasharray': DASHES[i], class: 'of-curve' }));
  });
  const seen = new Set();
  if (!hideAll && !hides(o, 'marks')) for (const m of marks) {
    const at = m.x !== undefined ? `x${r2(m.x)}` : `y${r2(m.yLine)}`; if (seen.has(at)) continue; seen.add(at);
    const c = colours[m.curve || 0];
    if (m.x !== undefined) kids.push(line(A.X(m.x), A.Y(m.y ?? 0), A.X(m.x), A.Y(lo), c, 1.5, { 'stroke-dasharray': '5 4', class: 'of-mark' }), label(r2(A.X(m.x)), m.top ? A.Y(m.y) - 12 : A.Y(lo) - 10, m.text, { anchor: 'middle', size: 12, colour: c, halo: P.paper, cls: 'of-mark-label' }));
    if (m.yLine !== undefined) kids.push(line(A.X(xr[0]), A.Y(m.yLine), A.X(xr[1]), A.Y(m.yLine), c, 1.5, { 'stroke-dasharray': '5 4', class: 'of-mark' }), label(A.X(xr[1]) - 4, A.Y(m.yLine) - 9, m.text, { anchor: 'end', size: 12, colour: c, halo: P.paper, cls: 'of-mark-label' }));
  }
  // the key, when there is more than one curve (or a curve has a name): each curve's line style and its name
  if (curves.length > 1 || curves.some(c => c.named)) curves.forEach((c, i) => {
    const kx = A.X(xr[1]) - 40 - Math.max(...curves.map(k => String(k.name).length)) * 7.2, ky = A.Y(Y.top) + 12 + 18 * i;
    kids.push(line(kx, ky, kx + 26, ky, colours[i], 3.2, { 'stroke-dasharray': DASHES[i] }), label(kx + 32, ky, c.name, { size: 12, colour: P.ink, halo: P.paper, cls: 'of-name' }));
  });
  if (d.heading) kids.push(label(A.w / 2, 11, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
  return frame(A.w, A.h, kids, { ...o, kind }, o.title || name);
}
const scale = (d, v) => (d.unit === 'percent' ? v * 100 : v * 10);

// ---------------------------------------------------------------- enzyme activity
const EN_KEYS = ['kind', 'hide', 'graph', 'curves', 'axes', 'unit', 'marks', 'x', 'heading', 'xtitle', 'ytitle'];
const EN_CURVE_KEYS = ['enzyme', 'name', 'opt', 'width', 'km', 'inhibitor', 'strength'];
const EN_NAMES = { human: 'enzymeHuman', taq: 'enzymeTaq', pepsin: 'enzymePepsin', amylase: 'enzymeAmylase', trypsin: 'enzymeTrypsin', catalase: 'enzymeCatalase' };
const enGraph = d => d.graph || 'temperature';
const enCurves = d => d.curves || [enGraph(d) === 'substrate' ? { km: 2 } : { enzyme: 'human' }];
/** A curve's optimum and width for this graph (temperature or pH). */
const enOpt = (c, g) => (c.enzyme ? EN_ENZYMES[c.enzyme][g === 'pH' ? 'ph' : 'temperature'] : [c.opt, c.width]);
const enKin = c => enKinetics(c.inhibitor || 'none', c.km, c.strength ?? 2);
function enX(d) {
  const g = enGraph(d), C = enCurves(d);
  if (d.x) return d.x;
  if (g === 'pH') return [0, 14];
  if (g === 'substrate') return [0, niceTop(Math.max(...C.map(c => enKin(c).km)) * 10, 8).top];
  return [0, niceTop(Math.max(...C.map(c => enDenaturedAbove(...enOpt(c, g)))) + 8, 8).top];
}
/**
 * { graph: "temperature" | "pH" | "substrate", curves: 1 to 3 of { enzyme: "human" | "taq" | "pepsin" | "amylase" |
 * "trypsin" | "catalase" } or { name, opt, width } (temperature: degrees C, the rate halving width degrees below opt;
 * pH: width pH units either side), or for substrate { name, km, inhibitor: "none" | "competitive" | "noncompetitive",
 * strength (1 + [I]/Ki, 2) }; axes: "shape" | "numbered", unit: "au" (10 at the fastest) | "percent", marks (each
 * optimum; Vmax and Km), x: [lo, hi], heading, xtitle, ytitle }. hide: "marks", "curves", true.
 */
export const enzymeActivity = {
  check(d) {
    const out = rateOdd(d, EN_KEYS, 'an enzyme activity graph');
    if (out.length) return out;
    const g = enGraph(d);
    if (!['temperature', 'pH', 'substrate'].includes(g)) return ['"graph" must be "temperature", "pH" or "substrate"'];
    const C = enCurves(d);
    if (!Array.isArray(C) || !C.length || C.length > 3) return ['"curves" lists 1 to 3 enzymes'];
    C.forEach((c, i) => {
      const at = `curve ${i + 1}`;
      if (!c || typeof c !== 'object') { out.push(`${at} must be an object`); return; }
      const k = Object.keys(c).find(x => !EN_CURVE_KEYS.includes(x)); if (k) { out.push(`${at} does not take "${k}"`); return; }
      if (c.name !== undefined && !text(c.name, 24)) out.push(`${at}: "name" must be short`);
      if (g === 'substrate') {
        if (c.enzyme !== undefined || c.opt !== undefined) out.push(`${at}: against substrate a curve is { km, inhibitor, strength }`);
        if (!isNum(c.km, 1e-6, 1e4)) out.push(`${at}: "km" (the substrate concentration at half Vmax) must be above 0`);
        if (c.inhibitor !== undefined && !EN_INHIBITORS.includes(c.inhibitor)) out.push(`${at}: "inhibitor" must be none, competitive or noncompetitive`);
        if (c.strength !== undefined && !isNum(c.strength, 1, 100)) out.push(`${at}: "strength" (1 + [I]/Ki) must be 1 to 100`);
      } else {
        if (c.km !== undefined || c.inhibitor !== undefined) out.push(`${at}: km and inhibitors are for the substrate graph`);
        if (c.enzyme !== undefined) { if (!Object.prototype.hasOwnProperty.call(EN_ENZYMES, c.enzyme)) out.push(`${at}: "enzyme" must be one of ${Object.keys(EN_ENZYMES).join(', ')}`); if (c.opt !== undefined || c.width !== undefined) out.push(`${at}: give an enzyme or its own opt and width, not both`); }
        else if (g === 'pH' ? !(isNum(c.opt, 0, 14) && isNum(c.width, 0.5, 7)) : !(isNum(c.opt, 0, 110) && isNum(c.width, 2, 30))) out.push(`${at}: give an "enzyme", or "opt" and "width" (${g === 'pH' ? 'pH 0 to 14, width 0.5 to 7' : 'degrees C 0 to 110, width 2 to 30'})`);
      }
    });
    if (d.axes !== undefined && !['shape', 'numbered'].includes(d.axes)) out.push('"axes" must be "shape" or "numbered"');
    if (d.unit !== undefined && !['au', 'percent'].includes(d.unit)) out.push('"unit" must be "au" or "percent"');
    if (d.marks !== undefined && typeof d.marks !== 'boolean') out.push('"marks" must be true or false');
    if (d.x !== undefined && !rateRange(d.x, g === 'pH' ? 0 : 0, g === 'pH' ? 14 : 1e5)) out.push(`"x" is the axis [lo, hi]${g === 'pH' ? ' within pH 0 to 14' : ', from 0'}`);
    if (out.length) return out;
    if (g !== 'substrate' && d.marks) {
      const [lo, hi] = enX(d);
      if (C.some(c => enOpt(c, g)[0] < lo || enOpt(c, g)[0] > hi)) out.push('an optimum is off the axis: widen "x"');
    }
    return out;
  },
  /** Each curve's optimum and where it has denatured (or its Vmax, Km and half Vmax), the first curve's at the top level. */
  solve(d) {
    if (enzymeActivity.check(d).length) return null;
    const g = enGraph(d), curves = enCurves(d).map(c => {
      if (g === 'substrate') { const k = enKin(c); return { vmax: scale(d, k.vmax), km: k.km, halfVmax: scale(d, k.vmax) / 2 }; }
      const [opt, width] = enOpt(c, g);
      return g === 'pH' ? { optimum: opt, denaturedLow: opt - width, denaturedHigh: opt + width } : { optimum: opt, denatured: enDenaturedAbove(opt, width), maxRate: scale(d, 1) };
    });
    return { graph: g, ...curves[0], curves };
  },
  draw(d, o) {
    const W = figWords(o.lang), g = enGraph(d), C = enCurves(d), xr = enX(d), shape = d.axes !== 'numbered', S = d.unit === 'percent' ? '%' : W('au');
    const nameOf = (c, i) => text(c.name, 24) || (c.enzyme ? W(EN_NAMES[c.enzyme]) : g === 'substrate' && c.inhibitor && c.inhibitor !== 'none' ? W(c.inhibitor === 'competitive' ? 'competitive' : 'noncompetitive') : `${W('enzyme')} ${'ABC'[i]}`);
    const curves = C.map((c, i) => {
      const named = C.length > 1 || !!c.name || !!c.enzyme || (g === 'substrate' && c.inhibitor && c.inhibitor !== 'none');
      if (g === 'substrate') { const k = enKin(c); return { f: s => scale(d, enRateAtSubstrate(s, k)), name: nameOf(c, i), named }; }
      const [opt, width] = enOpt(c, g);
      return { f: x => scale(d, g === 'pH' ? enRateAtPH(x, opt, width) : enRateAtTemperature(x, opt, width)), name: nameOf(c, i), named };
    });
    const marks = [];
    if (d.marks) C.forEach((c, i) => {
      if (g === 'substrate') { const k = enKin(c); marks.push({ curve: i, yLine: scale(d, k.vmax), text: `Vmax` }); if (k.km <= xr[1]) marks.push({ curve: i, x: k.km, y: scale(d, k.vmax) / 2, text: 'Km' }); }
      else { const opt = enOpt(c, g)[0]; marks.push({ curve: i, x: opt, y: scale(d, 1), top: true, text: shape ? W('optimum') : `${W('optimum')} ${fmt(opt, 1, o.lang)}${g === 'pH' ? '' : ' °C'}` }); }
    });
    const xtitle = text(d.xtitle, 50) || (g === 'temperature' ? axisTitle(W('temperature'), '°C') : g === 'pH' ? 'pH' : axisTitle(W('substrateConc'), shape ? '' : W('au')));
    const ytitle = text(d.ytitle, 50) || axisTitle(W('rateOfReaction'), shape ? '' : S);
    return rateGraph(d, o, { kind: 'enzymeActivity', name: W('enzymeActivity'), xr, yTop: scale(d, 1) * (C.length > 1 ? 1.4 : 1.15), xtitle, ytitle, curves, marks, shape, xstep: g === 'pH' ? 1 : undefined });
  },
};

// ---------------------------------------------------------------- photosynthesis rate
const PS_KEYS = ['kind', 'hide', 'graph', 'curves', 'lightAxis', 'net', 'axes', 'marks', 'x', 'heading', 'xtitle', 'ytitle'];
const psGraph = d => d.graph || 'light';
const psCurves = d => d.curves || [{ light: 60, co2: 0.1, temp: 25 }];
const PS_NEEDS = { light: ['co2', 'temp'], co2: ['light', 'temp'], temperature: ['light', 'co2'] };
const psRate = (d, c) => {
  const g = psGraph(d), f = d.net ? psNet : psGross;
  if (g === 'light') return x => f(d.lightAxis === 'distance' ? psIntensityAt(x) : x, c.co2, c.temp);
  if (g === 'co2') return x => f(c.light, x, c.temp);
  return x => f(c.light, c.co2, x);
};
function psX(d) {
  if (d.x) return d.x;
  const g = psGraph(d), C = psCurves(d);
  if (g === 'light') return d.lightAxis === 'distance' ? [0, 100] : [0, niceTop(Math.max(...C.map(c => psLightSaturation(c.co2, c.temp))) * 1.5, 8).top];
  if (g === 'co2') return [0, 0.5];
  return [0, 50];
}
/** Where a curve levels off, its plateau and what limits it there (the factor that, raised, would raise the plateau). */
function psFacts(d, c) {
  const g = psGraph(d);
  if (g === 'light') return { plateau: psLightPlateau(c.co2, c.temp) - (d.net ? psRespiration(c.temp) : 0), saturation: psLightSaturation(c.co2, c.temp), compensation: psLightCompensation(c.co2, c.temp) };
  if (g === 'co2') { const sat = psCo2Saturation(c.light, c.temp); return { plateau: psCo2Plateau(c.light, c.temp) - (d.net ? psRespiration(c.temp) : 0), saturation: Number.isFinite(sat) ? sat : null }; }
  const f = psRate(d, c), opt = psFastestAt(f, 0, PS_DENATURED_AT);
  return { plateau: f(opt), optimum: opt, denatured: PS_DENATURED_AT };
}
/**
 * { graph: "light" | "co2" | "temperature", curves: 1 to 3 of { light (intensity, 0 to 2000), co2 (%, 0 to 5), temp
 * (degrees C, 0 to 60), name } (each gives the two quantities not on the axis), lightAxis: "intensity" | "distance" (the
 * lamp's distance in cm), net (photosynthesis less respiration: below 0 in the dark), axes: "shape" | "numbered",
 * marks (each plateau), x, heading, xtitle, ytitle }. hide: "marks", "curves", true.
 */
export const photosynthesis = {
  check(d) {
    const out = rateOdd(d, PS_KEYS, 'a photosynthesis rate graph');
    if (out.length) return out;
    const g = psGraph(d);
    if (!PS_NEEDS[g]) return ['"graph" must be "light", "co2" or "temperature"'];
    const C = psCurves(d);
    if (!Array.isArray(C) || !C.length || C.length > 3) return ['"curves" lists 1 to 3 curves'];
    const LIM = { light: [0, 2000], co2: [0, 5], temp: [0, 60] };
    C.forEach((c, i) => {
      const at = `curve ${i + 1}`;
      if (!c || typeof c !== 'object') { out.push(`${at} must be an object`); return; }
      const k = Object.keys(c).find(x => !['light', 'co2', 'temp', 'name'].includes(x)); if (k) { out.push(`${at} does not take "${k}"`); return; }
      for (const q of PS_NEEDS[g]) if (!isNum(c[q], ...LIM[q])) out.push(`${at}: "${q}" must be ${LIM[q][0]} to ${LIM[q][1]} (against ${g}, each curve gives ${PS_NEEDS[g].join(' and ')})`);
      const axisQ = g === 'temperature' ? 'temp' : g; if (c[axisQ] !== undefined) out.push(`${at}: "${axisQ}" is on the axis, so a curve does not take it`);
      if (c.name !== undefined && !text(c.name, 30)) out.push(`${at}: "name" must be short`);
    });
    if (d.lightAxis !== undefined && (!['intensity', 'distance'].includes(d.lightAxis) || g !== 'light')) out.push('"lightAxis" is "intensity" or "distance", for the light graph');
    for (const b of ['net', 'marks']) if (d[b] !== undefined && typeof d[b] !== 'boolean') out.push(`"${b}" must be true or false`);
    if (d.axes !== undefined && !['shape', 'numbered'].includes(d.axes)) out.push('"axes" must be "shape" or "numbered"');
    if (d.x !== undefined && !rateRange(d.x, 0, 5000)) out.push('"x" is the axis [lo, hi], from 0');
    if (!out.length && d.lightAxis === 'distance' && psX(d)[0] < 2 && d.x) out.push('the lamp is at least 2 cm away');
    return out;
  },
  /** Each curve's plateau (the most it reaches as the axis's factor grows), where it levels off (95% of the plateau), the
   *  light compensation point and the best temperature; the first curve's at the top level. */
  solve(d) {
    if (photosynthesis.check(d).length) return null;
    const curves = psCurves(d).map(c => psFacts(d, c));
    return { graph: psGraph(d), ...curves[0], curves, respiration: psRespiration(psCurves(d)[0].temp ?? 25) };
  },
  draw(d, o) {
    const W = figWords(o.lang), g = psGraph(d), C = psCurves(d), shape = d.axes !== 'numbered', dist = g === 'light' && d.lightAxis === 'distance';
    let xr = psX(d); if (dist && xr[0] < 2) xr = [Math.max(xr[0], 4), xr[1]];
    const words = c => [g !== 'light' && `${W('light')} ${fmt(c.light, 0, o.lang)}`, g !== 'co2' && `${fmt(c.co2, 2, o.lang)}% CO₂`, g !== 'temperature' && `${fmt(c.temp, 0, o.lang)} °C`].filter(Boolean).join(', ');
    const curves = C.map(c => ({ f: psRate(d, c), name: text(c.name, 30) || words(c), named: true }));
    let top = 0, lo = 0;
    for (const c of curves) for (let k = 0; k <= 200; k++) { const v = c.f(xr[0] + ((xr[1] - xr[0]) * k) / 200); if (Number.isFinite(v)) { top = Math.max(top, v); lo = Math.min(lo, v); } }
    const marks = d.marks ? C.map((c, i) => ({ curve: i, yLine: psFacts(d, c).plateau, text: W('plateau') })) : [];
    const xtitle = text(d.xtitle, 50) || (g === 'light' ? (dist ? axisTitle(W('lampDistance'), 'cm') : axisTitle(W('lightIntensity'), shape ? '' : W('au'))) : g === 'co2' ? axisTitle(W('co2Conc'), '%') : axisTitle(W('temperature'), '°C'));
    const ytitle = text(d.ytitle, 50) || axisTitle(W(d.net ? 'netPhotosynthesis' : 'photosynthesisRate'), shape ? '' : W('au'));
    return rateGraph(d, o, { kind: 'photosynthesis', name: W('photosynthesis'), xr, yTop: top * (C.length > 1 ? 1.4 : 1.15), yLo: d.net ? lo * 1.2 : 0, xtitle, ytitle, curves, marks, shape });
  },
};
export const RATE_KINDS = { enzymeActivity, photosynthesis };
