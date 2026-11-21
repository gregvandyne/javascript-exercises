// Oomba Figures: chemistry's lab readings (1.2.0), more types of `reading` (readings.js hands them over): a buret read
// down from 0 (with an initial reading too, for a titre), a beaker, a gas syringe (alone or collecting gas from a
// flask), a digital balance, a triple beam balance, a digital thermometer, and a pH meter (digital or analog) or pH
// paper. Each is drawn from its number: the meniscus's bottom, the plunger's face, the needle and the riders sit exactly
// at the reading, and a display shows exactly its places. A reading the instrument cannot show is refused: on a scale
// it must be on a mark or half way between two (Oomba's reading rule, as on the thermometer), on a display it has at
// most the display's places. The instruments' numbers are ported (ported/labware.js); the checks and drawings are
// Oomba's own. hide ("value" or true): the reading under the figure is a blank line.
import { node, label, line, path, frame, palette, fmt, isNum, r2 } from './svg.js';
import { figWords } from './words.js';
import { LW_BALANCE, LW_TRIPLE_BEAM, lwRiders, LW_PH_MIN, LW_PH_MAX, lwNeedle, LW_PH_COLORS, lwConvert, lwDigitalRange, lwMeniscus, lwFlatMeniscus } from './ported/labware.js';

export const LAB_TYPES = ['buret', 'beaker', 'syringe', 'balance', 'tripleBeam', 'pH'];
/** Is this reading one of the lab readings drawn here (a digital thermometer too)? */
export const isLab = d => !!d && (LAB_TYPES.includes(d.type) || (d.type === 'thermometer' && d.digital !== undefined && d.digital !== false));
const labNear = (x, s) => Math.abs(x / s - Math.round(x / s)) < 1e-6;
const labDec = x => { const s = String(Math.round(x * 1e6) / 1e6); return s.includes('.') ? s.split('.')[1].length : 0; };
/** A number with exactly dp decimals (a display, a buret's two places), in the reader's decimal mark. */
const labFixed = (x, dp, lang) => { try { return new Intl.NumberFormat(/^ar\b/.test(lang) ? 'ar-u-nu-latn' : lang || 'en', { minimumFractionDigits: dp, maximumFractionDigits: dp, useGrouping: false }).format(x); } catch (e) { return x.toFixed(dp); } };
const labBlank = o => o.hide === true || o.hide === 'value';
const labKeys = (d, keys) => Object.keys(d).filter(k => !['kind', 'hide', 'type', ...keys].includes(k)).map(k => `a ${d.type === 'thermometer' ? 'digital thermometer' : d.type} does not take "${k}"`);
const TEMP_UNITS = ['°C', 'K', '°F'];
const VOL_UNITS = ['mL', 'cm³'];
/** The scale checks every marked lab instrument shares: max, step and major, and a value on a mark or half way. */
function labScale(d, out, { min = 0, maxes, steps, what = 'value', most = 120 }) {
  if (!isNum(d.max) || !(maxes ? maxes.includes(d.max) : d.max > min)) { out.push(maxes ? `"max" (its capacity) must be one of ${maxes.join(', ')}` : '"max" must be above 0'); return; }
  const step = d.step ?? steps[0];
  if (!steps.some(s => Math.abs(s - step) < 1e-9)) { out.push(`"step" (one small mark) must be ${steps.join(', ')}`); return; }
  const n = (d.max - min) / step;
  if (!labNear(d.max - min, step) || n < 2 || n > most) { out.push(`the scale must have 2 to ${most} small marks: (max − min) / step must be a whole number`); return; }
  if (d.major !== undefined && (!isNum(d.major, 1e-9) || !labNear(d.major, step) || !labNear(d.max - min, d.major))) out.push('"major" must be a whole number of steps that fits the scale');
  for (const k of [].concat(what)) {
    if (d[k] === undefined && k !== 'value') continue;
    if (!isNum(d[k], min, d.max)) out.push(`"${k}" must be on the scale, from ${min} to ${d.max}`);
    else if (!labNear(d[k] - min, step / 2)) out.push(`"${k}" ${d[k]} is not on a mark or half way between two (a mark is ${step}): a student cannot read it`);
  }
}

// ---------------------------------------------------------------- checks
export function labCheck(d) {
  const out = [];
  if (d.type === 'buret') {
    out.push(...labKeys(d, ['value', 'max', 'initial', 'unit']));
    if (d.unit !== undefined && !VOL_UNITS.includes(d.unit)) out.push('a buret\'s "unit" is "mL" or "cm³"');
    if (out.length) return out;
    labScale(d, out, { maxes: [25, 50], steps: [0.1], what: ['value', 'initial'], most: 500 });
    if (!out.length && d.initial !== undefined && d.initial >= d.value) out.push('the "initial" reading must be below the final one ("value"): a buret reads down as it empties');
    return out;
  }
  if (d.type === 'beaker') {
    out.push(...labKeys(d, ['value', 'max', 'step', 'major', 'unit']));
    if (d.unit !== undefined && !VOL_UNITS.includes(d.unit)) out.push('a beaker\'s "unit" is "mL" or "cm³"');
    if (out.length) return out;
    labScale(d, out, { maxes: [50, 100, 250, 400, 600, 1000], steps: [10, 25, 50, 100, 5] });
    if (!out.length && d.max / (d.step ?? 10) > 30) out.push('a beaker is marked coarsely: at most 30 marks (a bigger "step")');
    return out;
  }
  if (d.type === 'syringe') {
    out.push(...labKeys(d, ['value', 'max', 'step', 'major', 'unit', 'setup']));
    if (d.unit !== undefined && !VOL_UNITS.includes(d.unit)) out.push('a gas syringe\'s "unit" is "cm³" or "mL"');
    if (d.setup !== undefined && typeof d.setup !== 'boolean') out.push('"setup" must be true (collecting gas from a flask) or false');
    if (out.length) return out;
    labScale(d, out, { maxes: [50, 100], steps: [1, 2] });
    return out;
  }
  if (d.type === 'balance') {
    out.push(...labKeys(d, ['value', 'decimals', 'pan']));
    const dp = d.decimals ?? 2;
    if (!LW_BALANCE[dp]) out.push('"decimals" (the places the display shows) must be 1, 2, 3 or 4');
    if (d.pan !== undefined && !['boat', 'beaker', 'empty'].includes(d.pan)) out.push('"pan" must be "boat", "beaker" or "empty"');
    if (out.length) return out;
    if (!isNum(d.value, 0, LW_BALANCE[dp])) out.push(`"value" (grams) must be from 0 to ${LW_BALANCE[dp]}, what a balance showing ${dp} places holds`);
    else if (!labNear(d.value, 10 ** -dp)) out.push(`"value" ${d.value} has more places than the display shows (${dp})`);
    return out;
  }
  if (d.type === 'tripleBeam') {
    out.push(...labKeys(d, ['value']));
    if (out.length) return out;
    if (!isNum(d.value, 0, LW_TRIPLE_BEAM)) out.push(`"value" (grams) must be from 0 to ${LW_TRIPLE_BEAM}`);
    else if (!labNear(d.value, 0.05)) out.push(`"value" ${d.value} is not on a mark of the front beam (every 0.1 g) or half way between two: a student cannot read it`);
    return out;
  }
  if (d.type === 'thermometer') {
    out.push(...labKeys(d, ['digital', 'value', 'decimals', 'unit']));
    if (d.digital !== true) out.push('"digital" must be true (or leave it out for a liquid-in-glass thermometer)');
    const dp = d.decimals ?? 1, unit = d.unit ?? '°C';
    if (![0, 1, 2].includes(dp)) out.push('"decimals" (the places the display shows) must be 0, 1 or 2');
    if (!TEMP_UNITS.includes(unit)) out.push('a digital thermometer\'s "unit" is "°C", "K" or "°F"');
    if (out.length) return out;
    const r = lwDigitalRange(unit);
    if (!isNum(d.value, r.min, r.max)) out.push(`"value" must be from ${r.min} to ${r.max} ${unit} (what a probe thermometer reads)`);
    else if (!labNear(d.value, 10 ** -dp)) out.push(`"value" ${d.value} has more places than the display shows (${dp})`);
    return out;
  }
  // pH
  out.push(...labKeys(d, ['meter', 'value', 'decimals']));
  const m = d.meter ?? 'digital';
  if (!['digital', 'analog', 'paper'].includes(m)) out.push('"meter" must be "digital", "analog" or "paper"');
  if (d.decimals !== undefined && (m !== 'digital' || ![1, 2].includes(d.decimals))) out.push(m === 'digital' ? '"decimals" must be 1 or 2' : '"decimals" is for a digital pH meter only');
  if (out.length) return out;
  if (!isNum(d.value, LW_PH_MIN, LW_PH_MAX)) out.push(`"value" (the pH) must be from ${LW_PH_MIN} to ${LW_PH_MAX}`);
  else if (m === 'digital' && !labNear(d.value, 10 ** -(d.decimals ?? 2))) out.push(`"value" ${d.value} has more places than the display shows (${d.decimals ?? 2})`);
  else if (m === 'analog' && !labNear(d.value, 0.1)) out.push(`"value" ${d.value} is not on a mark of the dial (every 0.2) or half way between two: a student cannot read it`);
  else if (m === 'paper' && !Number.isInteger(d.value)) out.push('pH paper matches a whole number: "value" must be 0 to 14, whole');
  return out;
}

// ---------------------------------------------------------------- answers
export function labSolve(d) {
  if (d.type === 'buret') {
    const out = { type: 'buret', value: d.value, unit: d.unit || 'mL', decimals: 2 };
    if (d.initial !== undefined) Object.assign(out, { initial: d.initial, final: d.value, titre: Math.round((d.value - d.initial) * 100) / 100 });
    return out;
  }
  if (d.type === 'beaker' || d.type === 'syringe') return { type: d.type, value: d.value, unit: d.unit || (d.type === 'syringe' ? 'cm³' : 'mL') };
  if (d.type === 'balance') return { type: 'balance', value: d.value, unit: 'g', decimals: d.decimals ?? 2, capacity: LW_BALANCE[d.decimals ?? 2] };
  if (d.type === 'tripleBeam') return { type: 'tripleBeam', value: d.value, unit: 'g', ...lwRiders(d.value) };
  if (d.type === 'thermometer') {
    const unit = d.unit ?? '°C', c = lwConvert(d.value, unit, '°C');
    return { type: 'thermometer', digital: true, value: d.value, unit, decimals: d.decimals ?? 1, celsius: Math.round(c * 100) / 100, kelvin: Math.round(lwConvert(d.value, unit, 'K') * 100) / 100 };
  }
  const m = d.meter ?? 'digital';
  return { type: 'pH', meter: m, value: d.value, decimals: m === 'digital' ? d.decimals ?? 2 : m === 'analog' ? 1 : 0, acidic: d.value < 7, neutral: d.value === 7 };
}

// ---------------------------------------------------------------- drawing
const caption = (x, y, words, P) => label(x, y, words, { anchor: 'middle', size: 17, weight: 800, colour: P.ink, cls: 'of-value' });
const liquidFill = (P, o) => (o.print ? '#DDDDDD' : P.liquid);
export function labDraw(d, o) {
  const f = { buret: buretDraw, beaker: beakerDraw, syringe: syringeDraw, balance: balanceDraw, tripleBeam: tripleBeamDraw, thermometer: thermoDraw, pH: phDraw }[d.type];
  return f(d, o);
}
/** A close-up of a buret's tube around a reading: 3 mL of it, 0 at the top, the meniscus's bottom at the value. */
function buretPanel(v, max, dx, P, o) {
  const K = 90, S = 3, lo = Math.max(0, Math.min(max - S, Math.floor(v) - 1)), top = 46, bot = top + S * K, x0 = dx + 30, tw = 44, Y = x => top + (x - lo) * K, kids = [];
  const zig = y => path(`M ${x0 - 6} ${y} l 8 -5 l 10 10 l 10 -10 l 10 10 l 10 -10 l 8 5`, { stroke: P.muted, 'stroke-width': 1.4 });
  const lvl = Y(v), men = 16;
  kids.push(node('rect', { x: x0, y: r2(lvl - men), width: tw, height: r2(bot + 14 - lvl + men), fill: liquidFill(P, o), 'fill-opacity': o.print ? null : 0.55 }),
    path(lwMeniscus(x0, x0 + tw, r2(lvl), men), { stroke: P.blue, 'stroke-width': 2.2, fill: P.paper, class: 'of-level' }),
    line(x0, top - 14, x0, bot + 14, P.ink, 2.5), line(x0 + tw, top - 14, x0 + tw, bot + 14, P.ink, 2.5));
  if (lo > 0) kids.push(zig(top - 14));
  kids.push(zig(bot + 14));
  for (let k = 0; k <= S * 10; k++) {
    const x = lo + k / 10, whole = k % 10 === 0, half = k % 5 === 0;
    kids.push(line(x0, Y(x), x0 + (whole ? 26 : half ? 18 : 10), Y(x), P.ink, whole ? 1.8 : 1.1));
    if (whole) kids.push(label(x0 + tw + 8, Y(x), fmt(x, 0, o.lang), { size: 14, weight: 700, colour: P.ink2 }));
  }
  return { kids, w: tw + 80, h: bot + 18 };
}
function buretDraw(d, o) {
  const P = palette(o), W = figWords(o.lang), unit = d.unit || 'mL', kids = [];
  const panels = d.initial !== undefined ? [[d.initial, W('initial')], [d.value, W('final')]] : [[d.value, '']];
  let x = 0, h = 0;
  for (const [v, name] of panels) {
    const p = buretPanel(v, d.max, x, P, o);
    kids.push(node('g', { class: name ? 'of-panel' : null }, p.kids));
    if (name) kids.push(label(x + 52, 12, name, { anchor: 'middle', size: 14, colour: P.ink2 }));
    kids.push(caption(x + 62, p.h + 22, labBlank(o) ? `______ ${unit}` : `${labFixed(v, 2, o.lang)} ${unit}`, P));
    x += p.w + 30; h = p.h + 44;
  }
  return frame(x - 10, h, kids, { ...o, kind: 'reading' }, o.title || W('buret'));
}
function beakerDraw(d, o) {
  const P = palette(o), W = figWords(o.lang), unit = d.unit || 'mL', step = d.step ?? 10, major = d.major ?? (d.max / step > 10 ? step * 2 : step);
  const left = 30, iw = 180, SH = 240, bot = 40 + 54 + SH, Y = v => bot - (v / d.max) * SH, top = Y(d.max) - 54, kids = [];
  const lvl = Y(d.value), men = 5, edge = 12;
  kids.push(node('rect', { x: left, y: r2(lvl - men), width: iw, height: r2(bot - lvl + men), fill: liquidFill(P, o), 'fill-opacity': o.print ? null : 0.55 }),
    path(lwFlatMeniscus(left, left + iw, r2(lvl), men, edge), { stroke: P.blue, 'stroke-width': 2.2, fill: P.paper, class: 'of-level' }),
    path(`M ${left - 14} ${top - 6} Q ${left - 2} ${top - 4} ${left} ${top + 8} L ${left} ${bot} L ${left + iw} ${bot} L ${left + iw} ${top}`, { stroke: P.ink, 'stroke-width': 2.6 }));
  const sx = left + 30, steps = Math.round(d.max / step);
  for (let k = 1; k <= steps; k++) {
    const v = k * step, big = labNear(v, major);
    kids.push(line(sx, Y(v), sx + (big ? 40 : 24), Y(v), P.ink, big ? 1.8 : 1.2));
    if (big) kids.push(label(sx + 48, Y(v), fmt(v, 0, o.lang), { size: 13, weight: 700, colour: P.ink2 }));
  }
  kids.push(label(left + iw - 10, top + 18, `${fmt(d.max, 0, o.lang)} ${unit}`, { anchor: 'end', size: 12, weight: 600, colour: P.muted }));
  kids.push(caption(left + iw / 2, bot + 30, labBlank(o) ? `______ ${unit}` : `${fmt(d.value, labDec(step / 2), o.lang)} ${unit}`, P));
  return frame(left + iw + 30, bot + 50, kids, { ...o, kind: 'reading' }, o.title || W('beaker'));
}
function syringeDraw(d, o) {
  const P = palette(o), W = figWords(o.lang), unit = d.unit || 'cm³', step = d.step ?? 1, major = d.major ?? 10, half = 25, kids = [];
  const dx = d.setup ? 190 : 20, cy = d.setup ? 90 : 70, xZero = dx + 40, per = 360 / d.max, X = v => xZero + v * per, end = X(d.max) + 40;
  // the gas from the nozzle to the piston, the barrel with its cone and nozzle at the left (0), open at the right
  const pf = X(d.value), pl = end + 10 - xZero;
  kids.push(node('rect', { x: r2(xZero), y: r2(cy - half), width: r2(pf - xZero), height: 2 * half, fill: o.print ? '#F2F2F2' : P.fill, class: 'of-gas' }),
    // the plunger: a piston as long as the barrel, its face exactly at the reading, then the stem and knob
    node('rect', { x: r2(pf), y: cy - half + 3, width: r2(pl), height: 2 * half - 6, fill: o.print ? '#FFFFFF' : P.soft, stroke: P.ink, 'stroke-width': 1.6 }),
    node('rect', { x: r2(pf + pl), y: cy - 4, width: 14, height: 8, fill: P.ink2 }), node('rect', { x: r2(pf + pl + 14), y: cy - 16, width: 8, height: 32, rx: 2, fill: P.ink2 }),
    path(`M ${dx} ${cy - 5} L ${xZero - 14} ${cy - 5} L ${xZero} ${cy - half} L ${r2(end)} ${cy - half} M ${dx} ${cy + 5} L ${xZero - 14} ${cy + 5} L ${xZero} ${cy + half} L ${r2(end)} ${cy + half}`, { stroke: P.ink, 'stroke-width': 2.4 }),
    line(end, cy - half - 6, end, cy - half, P.ink, 2.4), line(end, cy + half, end, cy + half + 6, P.ink, 2.4));
  // the scale on the glass, over the piston
  const steps = Math.round(d.max / step);
  for (let k = 0; k <= steps; k++) {
    const v = k * step, big = labNear(v, major), mid = !big && labNear(v, major / 2);
    kids.push(line(X(v), cy - half, X(v), cy - half + (big ? 16 : mid ? 11 : 7), P.ink, big ? 1.7 : 1.1));
    if (big) kids.push(label(X(v), cy - half - 12, fmt(v, 0, o.lang), { anchor: 'middle', size: 13, weight: 700, colour: P.ink2 }));
  }
  kids.push(label(r2(end), cy - half - 28, unit, { anchor: 'end', size: 12, weight: 600, colour: P.muted }), line(pf, cy - half + 1, pf, cy + half - 1, P.red, 3.2, { class: 'of-level' }));
  const Wd = Math.max(end, pf + pl + 22) + 16;
  if (d.setup) {
    // a conical flask on the bench, its delivery tube rising through the bung and across to the nozzle
    const fx = 90, bench = 230;
    kids.push(path(`M ${fx - 16} ${bench - 150} L ${fx - 16} ${bench - 110} L ${fx - 66} ${bench} L ${fx + 66} ${bench} L ${fx + 16} ${bench - 110} L ${fx + 16} ${bench - 150}`, { stroke: P.ink, 'stroke-width': 2.4 }),
      node('rect', { x: fx - 22, y: bench - 162, width: 44, height: 24, rx: 4, fill: P.ink2 }),
      path(`M ${fx} ${bench - 100} L ${fx} ${cy} L ${dx} ${cy}`, { stroke: P.ink, 'stroke-width': 6, 'stroke-linejoin': 'round' }), path(`M ${fx} ${bench - 100} L ${fx} ${cy} L ${dx} ${cy}`, { stroke: P.paper, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
      line(10, bench, Wd - 10, bench, P.muted, 2));
  }
  const Ht = (d.setup ? 230 : cy + half + 20) + 46;
  kids.push(caption(r2((dx + end) / 2), Ht - 18, labBlank(o) ? `______ ${unit}` : `${fmt(d.value, labDec(step / 2), o.lang)} ${unit}`, P));
  return frame(r2(Wd), Ht, kids, { ...o, kind: 'reading' }, o.title || W('gasSyringe'));
}
/** A digital display: dark glass, the digits in a fixed-width face (a device writes "." whatever the language). */
function display(x, y, w, h, digits, unit, P, o) {
  return node('g', { class: 'of-display' }, node('rect', { x, y, width: w, height: h, rx: 6, fill: o.print ? '#FFFFFF' : '#1F2A24', stroke: P.ink, 'stroke-width': 2 }),
    node('text', { x: x + w - 12 - (unit ? unit.length * 11 + 6 : 0), y: y + h / 2 + 1, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': Math.round(h * 0.62), 'font-weight': 700, 'font-family': 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace', fill: o.print ? '#000000' : '#C9F5D6', class: 'of-level' }, digits),
    unit ? label(x + w - 10, y + h / 2 + 2, unit, { anchor: 'end', size: Math.round(h * 0.36), colour: o.print ? '#000000' : '#C9F5D6' }) : null);
}
function balanceDraw(d, o) {
  const P = palette(o), W = figWords(o.lang), dp = d.decimals ?? 2, pan = d.pan || 'boat', fine = dp >= 3, kids = [], top = fine ? 20 : 60;
  if (fine) kids.push(node('rect', { x: 70, y: top, width: 240, height: 150 - top, fill: 'none', stroke: P.muted, 'stroke-width': 1.6, class: 'of-shield' }), line(190, top, 190, 150, P.grid, 1));
  kids.push(node('rect', { x: 30, y: 150, width: 320, height: 86, rx: 12, fill: o.print ? '#FFFFFF' : P.soft, stroke: P.ink, 'stroke-width': 2.4 }),
    node('rect', { x: 180, y: 140, width: 20, height: 10, fill: P.ink2 }), node('rect', { x: 110, y: 132, width: 160, height: 9, rx: 3, fill: o.print ? '#EEEEEE' : '#D9D4C2', stroke: P.ink, 'stroke-width': 1.8 }),
    display(110, 168, 170, 46, d.value.toFixed(dp), 'g', P, o));
  if (pan === 'boat') kids.push(path('M 150 118 L 230 118 L 220 132 L 160 132 Z', { fill: '#FFFFFF', stroke: P.ink, 'stroke-width': 1.8 }));
  if (pan === 'beaker') kids.push(path('M 152 62 L 160 66 L 160 132 L 220 132 L 220 62', { stroke: P.ink, 'stroke-width': 2.2 }));
  kids.push(caption(190, 266, labBlank(o) ? '______ g' : `${labFixed(d.value, dp, o.lang)} g`, P));
  const dy = fine ? 0 : pan === 'beaker' ? 46 : 96;   // no room kept above the pan for a draft shield it has not got
  return frame(380, 290 - dy, [node('g', { transform: dy ? `translate(0 ${-dy})` : null }, kids)], { ...o, kind: 'reading' }, o.title || W('balance'));
}
function tripleBeamDraw(d, o) {
  const P = palette(o), W = figWords(o.lang), r = lwRiders(d.value), x0 = 190, L = 400, kids = [];
  const beam = (y, max, every, numberEvery, at, notched) => {
    const X = v => x0 + (v / max) * L;
    kids.push(node('rect', { x: x0 - 12, y: y - 10, width: L + 24, height: 20, rx: 3, fill: o.print ? '#FFFFFF' : P.soft, stroke: P.ink, 'stroke-width': 1.8 }));
    const n = Math.round(max / every);
    for (let k = 0; k <= n; k++) {
      const v = k * every, num = labNear(v, numberEvery);
      kids.push(line(X(v), y - 10, X(v), y - 10 + (num ? 9 : notched ? 6 : labNear(v, numberEvery / 2) ? 6 : 4), P.ink, num ? 1.5 : 1));
      if (num) kids.push(label(X(v), y + 4, fmt(v, 0, o.lang), { anchor: 'middle', size: 10, weight: 700, colour: P.ink2 }));
    }
    // the rider, its pointer exactly at its value
    const rx = X(at);
    kids.push(node('polygon', { points: `${r2(rx)},${y - 9} ${r2(rx - 8)},${y - 22} ${r2(rx + 8)},${y - 22}`, fill: P.red, class: 'of-rider' }), node('rect', { x: r2(rx - 8), y: y - 30, width: 16, height: 8, rx: 2, fill: P.red }));
  };
  beam(60, 100, 10, 10, r.tens, true);
  beam(120, 500, 100, 100, r.hundreds, true);
  beam(180, 10, 0.1, 1, r.front, false);
  // the pan at the left, the beams' pivot and the pointer at the right on 0 (balanced)
  kids.push(line(x0 - 12, 60, x0 - 12, 180, P.ink, 2.4), node('rect', { x: 30, y: 196, width: 140, height: 8, rx: 3, fill: P.ink2 }), line(100, 204, 100, 226, P.ink, 3),
    node('rect', { x: 20, y: 226, width: L + 200, height: 14, rx: 4, fill: o.print ? '#EEEEEE' : '#D9D4C2', stroke: P.ink, 'stroke-width': 1.8 }),
    line(x0 + L + 12, 120, x0 + L + 40, 120, P.ink, 2.4), line(x0 + L + 40, 106, x0 + L + 40, 134, P.ink, 1.6), label(x0 + L + 48, 120, '0', { size: 11, colour: P.ink2 }));
  kids.push(caption(x0 + L / 2, 266, labBlank(o) ? '______ g' : `${fmt(d.value, 2, o.lang)} g`, P));
  return frame(x0 + L + 70, 290, kids, { ...o, kind: 'reading' }, o.title || W('tripleBeam'));
}
/** A handheld meter with a probe dipped in a beaker (a digital thermometer, a digital pH meter). */
function meter(digits, unit, name, P, o) {
  const kids = [node('rect', { x: 30, y: 30, width: 190, height: 220, rx: 18, fill: o.print ? '#FFFFFF' : P.soft, stroke: P.ink, 'stroke-width': 2.4 }),
    display(46, 56, 158, 60, digits, unit, P, o), label(125, 150, name, { anchor: 'middle', size: 13, colour: P.ink2 }),
    node('circle', { cx: 90, cy: 200, r: 14, fill: 'none', stroke: P.ink, 'stroke-width': 1.8 }), node('circle', { cx: 160, cy: 200, r: 14, fill: 'none', stroke: P.ink, 'stroke-width': 1.8 }),
    path('M 220 80 C 280 80 300 60 320 60 L 320 214', { stroke: P.ink, 'stroke-width': 3 }), node('rect', { x: 314, y: 150, width: 12, height: 76, rx: 4, fill: P.ink2 }),
    node('rect', { x: 272, y: 180, width: 96, height: 56, fill: liquidFill(P, o), 'fill-opacity': o.print ? null : 0.55 }), path('M 266 120 L 270 124 L 270 240 L 370 240 L 370 120', { stroke: P.ink, 'stroke-width': 2.2 })];
  return kids;
}
function thermoDraw(d, o) {
  const P = palette(o), W = figWords(o.lang), dp = d.decimals ?? 1, unit = d.unit ?? '°C';
  const kids = [...meter(d.value.toFixed(dp), unit, W('digitalThermometer'), P, o), caption(200, 282, labBlank(o) ? `______ ${unit}` : `${labFixed(d.value, dp, o.lang)} ${unit}`, P)];
  return frame(400, 304, kids, { ...o, kind: 'reading' }, o.title || W('digitalThermometer'));
}
function phDraw(d, o) {
  const P = palette(o), W = figWords(o.lang), m = d.meter ?? 'digital';
  if (m === 'digital') {
    const dp = d.decimals ?? 2, kids = [...meter(d.value.toFixed(dp), 'pH', W('phMeter'), P, o), caption(200, 282, labBlank(o) ? 'pH ______' : `pH ${labFixed(d.value, dp, o.lang)}`, P)];
    return frame(400, 304, kids, { ...o, kind: 'reading' }, o.title || W('phMeter'));
  }
  if (m === 'analog') {
    const cx = 210, cy = 236, R = 160, kids = [node('rect', { x: 20, y: 30, width: 380, height: 236, rx: 14, fill: o.print ? '#FFFFFF' : P.soft, stroke: P.ink, 'stroke-width': 2.4 })];
    const at = (pH, rr) => { const a = lwNeedle(pH); return [cx + rr * Math.sin(a), cy - rr * Math.cos(a)]; };
    const arc = [at(0, R), at(14, R)];
    kids.push(path(`M ${r2(arc[0][0])} ${r2(arc[0][1])} A ${R} ${R} 0 0 1 ${r2(arc[1][0])} ${r2(arc[1][1])}`, { stroke: P.ink, 'stroke-width': 1.6 }));
    for (let k = 0; k <= 70; k++) {
      const v = k / 5, whole = k % 5 === 0, [x1, y1] = at(v, R), [x2, y2] = at(v, R + (whole ? 14 : 7));
      kids.push(line(r2(x1), r2(y1), r2(x2), r2(y2), P.ink, whole ? 1.6 : 1));
      if (whole) { const [lx, ly] = at(v, R + 26); kids.push(label(r2(lx), r2(ly), fmt(v, 0, o.lang), { anchor: 'middle', size: 13, weight: 700, colour: P.ink2 })); }
    }
    const [nx, ny] = at(d.value, R + 9);
    kids.push(line(cx, cy, r2(nx), r2(ny), P.red, 2.4, { class: 'of-level' }), node('circle', { cx, cy, r: 7, fill: P.ink }), label(cx, cy - 60, 'pH', { anchor: 'middle', size: 16, colour: P.ink2 }));
    kids.push(caption(cx, 294, labBlank(o) ? 'pH ______' : `pH ${fmt(d.value, 1, o.lang)}`, P));
    return frame(420, 316, kids, { ...o, kind: 'reading' }, o.title || W('phMeter'));
  }
  // pH paper: the wet strip above the chart it is matched against; in print the 15 swatches are grays, light to dark
  const sw = 32, gap = 4, pad = 14, cw = 2 * pad + 15 * (sw + gap) - gap, colour = k => (o.print ? `#${(240 - k * 15).toString(16).padStart(2, '0').repeat(3)}` : LW_PH_COLORS[k]);
  const kids = [node('rect', { x: cw / 2 - 110, y: 14, width: 220, height: 30, rx: 3, fill: '#FFFFFF', stroke: P.ink, 'stroke-width': 1.6 }),
    node('rect', { x: cw / 2 + 26, y: 14, width: 84, height: 30, fill: colour(d.value), stroke: P.ink, 'stroke-width': 1.6, class: 'of-level' }),
    node('rect', { x: 0, y: 66, width: cw, height: 96, rx: 8, fill: o.print ? '#FFFFFF' : P.soft, stroke: P.ink, 'stroke-width': 1.8 })];
  for (let k = 0; k <= 14; k++) {
    const x = pad + k * (sw + gap);
    kids.push(node('rect', { x, y: 94, width: sw, height: sw, rx: 3, fill: colour(k), stroke: P.ink, 'stroke-width': 1 }), label(x + sw / 2, 142, fmt(k, 0, o.lang), { anchor: 'middle', size: 13, weight: 700, colour: P.ink }));
  }
  kids.push(label(pad, 80, 'pH', { size: 13, colour: P.ink2 }), caption(cw / 2, 190, labBlank(o) ? 'pH ______' : `pH ${fmt(d.value, 0, o.lang)}`, P));
  return frame(cw, 210, kids, { ...o, kind: 'reading' }, o.title || W('phPaper'));
}
