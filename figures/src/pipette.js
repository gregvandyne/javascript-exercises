// Oomba Figures: reading a micropipette (1.3.0), one more type of `reading` (readings.js hands it over): an adjustable
// micropipette set to a volume, its digit wheels showing exactly the digits that volume needs on that model (P2 to
// P1000, ported/pipette.js), the wheels after the decimal point marked by a line across the window and, on screen, red
// digits; in print those wheels are shaded gray and the line stays, so nothing depends on color. A volume a model cannot
// be set to (outside a tenth of its largest volume up to it, or between its steps) fails the check. The checks, the
// answer (OF.solve) and the drawing are Oomba's own.
import { node, label, line, path, frame, palette, isNum, r2 } from './svg.js';
import { figWords } from './words.js';
import { PP_MODELS, ppStep, ppMin, ppDecimals, ppDecimalAfter, ppDigits, ppCanSet, ppTidy, ppRound } from './ported/pipette.js';

export const isPipette = d => !!d && d.type === 'micropipette';
const PP_KEYS = ['kind', 'hide', 'type', 'model', 'value', 'tip', 'parts', 'decimalLine', 'showModel'];
const modelOf = d => PP_MODELS[d.model || 'P20'];
const ppFixed = (x, dp, lang) => { try { return new Intl.NumberFormat(/^ar\b/.test(lang) ? 'ar-u-nu-latn' : lang || 'en', { minimumFractionDigits: dp, maximumFractionDigits: dp, useGrouping: false }).format(x); } catch (e) { return x.toFixed(dp); } };
/** { type: "micropipette", model: "P2" | "P10" | "P20" | "P100" | "P200" | "P1000", value (microliters), tip (true),
 *  parts (name the parts), decimalLine (true), showModel (true) }. hide: "value" (a blank to write the volume). */
export function pipetteCheck(d) {
  const k = Object.keys(d).find(x => !PP_KEYS.includes(x)); if (k) return [`a micropipette does not take "${k}"`];
  if (d.model !== undefined && !Object.prototype.hasOwnProperty.call(PP_MODELS, d.model)) return [`"model" must be one of ${Object.keys(PP_MODELS).join(', ')}`];
  const p = modelOf(d), out = [];
  for (const b of ['tip', 'parts', 'decimalLine', 'showModel']) if (d[b] !== undefined && typeof d[b] !== 'boolean') out.push(`"${b}" must be true or false`);
  if (!isNum(d.value)) out.push('"value" is the volume in µL');
  else if (d.value < ppMin(p) - 1e-9 || d.value > p.max + 1e-9) out.push(`a ${d.model || 'P20'} is set from ${ppMin(p)} to ${p.max} µL`);
  else if (!ppCanSet(p, d.value)) out.push(`a ${d.model || 'P20'} is set in steps of ${ppStep(p)} µL: ${d.value} cannot be dialed (the nearest is ${ppTidy(p, d.value)})`);
  return out;
}
/** The volume (µL and mL), the digits the wheels show top to bottom, and the model's range and step. */
export function pipetteSolve(d) {
  const p = modelOf(d), v = ppRound(d.value, ppDecimals(p));
  return { type: 'micropipette', model: d.model || 'P20', value: v, unit: 'µL', mL: ppRound(v / 1000, 6), digits: ppDigits(p, v).join('-'), min: ppMin(p), max: p.max, step: ppStep(p), decimals: ppDecimals(p) };
}
export function pipetteDraw(d, o) {
  const P = palette(o), W = figWords(o.lang), p = modelOf(d), digits = ppDigits(p, d.value), cx = 60, kids = [], wheel = 26, n = digits.length;
  const winTop = 96, winBot = winTop + n * wheel + 8, handleBot = Math.max(330, winBot + 150), shaftBot = handleBot + 170, tip = d.tip !== false, bottom = tip ? shaftBot + 70 : shaftBot;
  const body = o.print ? '#F2F2F2' : '#E9EEF2', ink = P.ink;
  // plunger, handle with its finger rest, the window, the shaft and the tip
  kids.push(node('rect', { x: cx - 14, y: 6, width: 28, height: 14, rx: 5, fill: o.print ? '#CCCCCC' : P.blue, stroke: ink, 'stroke-width': 1.6 }), node('rect', { x: cx - 9, y: 20, width: 18, height: 30, fill: body, stroke: ink, 'stroke-width': 1.6 }));
  kids.push(path(`M ${cx - 30} 50 L ${cx + 30} 50 L ${cx + 26} ${handleBot} L ${cx - 22} ${handleBot} Z`, { fill: body, stroke: ink, 'stroke-width': 2, class: 'of-handle' }));
  kids.push(path(`M ${cx + 28} 56 q 34 4 36 40 q -14 -22 -34 -18`, { fill: body, stroke: ink, 'stroke-width': 1.8 }));
  kids.push(node('rect', { x: cx - 18, y: winTop, width: 36, height: winBot - winTop, rx: 4, fill: P.paper, stroke: ink, 'stroke-width': 2, class: 'of-window' }));
  const after = ppDecimalAfter(p);
  digits.forEach((g, i) => {
    const y = winTop + 4 + i * wheel, red = p.red[i];
    kids.push(node('rect', { x: cx - 14, y, width: 28, height: wheel - 2, rx: 2, fill: red && o.print ? '#D9D9D9' : P.paper, stroke: P.gridStrong, 'stroke-width': 1, class: red ? 'of-wheel of-red' : 'of-wheel' }));
    kids.push(label(cx, y + wheel / 2, String(g), { anchor: 'middle', size: 20, weight: 800, colour: red && !o.print ? '#C0271D' : ink, cls: 'of-digit' }));
  });
  if (after !== null && d.decimalLine !== false) kids.push(line(cx - 20, winTop + 3 + after * wheel, cx + 20, winTop + 3 + after * wheel, ink, 2.6, { class: 'of-decimal' }));
  if (d.showModel !== false) kids.push(label(cx, winTop - 14, `${p.max} µL`, { anchor: 'middle', size: 13, weight: 800, colour: ink, cls: 'of-model' }));
  kids.push(node('rect', { x: cx - 20, y: handleBot, width: 40, height: 14, fill: body, stroke: ink, 'stroke-width': 1.6 }));
  kids.push(path(`M ${cx - 10} ${handleBot + 14} L ${cx + 10} ${handleBot + 14} L ${cx + 4} ${shaftBot} L ${cx - 4} ${shaftBot} Z`, { fill: body, stroke: ink, 'stroke-width': 1.6, class: 'of-shaft' }));
  kids.push(path(`M ${cx - 16} ${handleBot + 14} L ${cx + 16} ${handleBot + 14} L ${cx + 11} ${handleBot + 60} L ${cx - 11} ${handleBot + 60} Z`, { fill: o.print ? '#E0E0E0' : '#D3DCE3', stroke: ink, 'stroke-width': 1.4, class: 'of-ejector' }));
  if (tip) kids.push(path(`M ${cx - 7} ${shaftBot - 20} L ${cx + 7} ${shaftBot - 20} L ${cx + 1.5} ${bottom} L ${cx - 1.5} ${bottom} Z`, { fill: o.print ? '#FFFFFF' : p.max >= 1000 ? '#CFE2F6' : p.max >= 100 ? '#F8EDB4' : '#F6F6F6', stroke: ink, 'stroke-width': 1.4, class: 'of-tip' }));
  let w = 150;
  if (d.parts) {
    const names = [[W('plunger'), 13], [W('volumeDisplay'), (winTop + winBot) / 2], [W('handle'), (winBot + handleBot) / 2 + 10], [W('tipEjector'), handleBot + 36], [W('shaft'), handleBot + 110], ...(tip ? [[W('tip'), shaftBot + 30]] : [])];
    for (const [t, y] of names) kids.push(line(cx + 34, r2(y), cx + 100, r2(y), P.muted, 1.2), label(cx + 104, r2(y), t, { size: 13, colour: ink, cls: 'of-part' }));
    w = 290;
  }
  const blank = o.hide === true || o.hide === 'value';
  kids.push(label(w / 2, bottom + 24, blank ? `${W('volume')}: ______ µL` : `${W('volume')}: ${ppFixed(d.value, ppDecimals(p), o.lang)} µL`, { anchor: 'middle', size: 16, weight: 800, colour: ink, cls: 'of-value' }));
  return frame(w, bottom + 40, kids, { ...o, kind: 'reading' }, o.title || W('micropipette'));
}
