// Oomba Figures: reading a scale. A thermometer, a measuring cylinder (read at the bottom of the meniscus) and a spring
// balance (newton meter). The scale is evenly spaced from min to max with a tick every "step" and a number every
// "major"; the liquid, the meniscus or the pointer sits exactly at the value. hide: the reading under the figure is a
// blank line (the student writes it). Since 1.1.0 also a ruler (centimeters or inches) with an object lying along it
// from "start": its ends sit exactly on their marks, and the reading is the object's length (the marks and how a length
// is written are ported, ported/ruler.js; the checks and the drawing are Oomba's own).
import { node, label, line, path, frame, palette, fmt, isNum, text, r2 } from './svg.js';
import { figWords } from './words.js';
import { ruTicks, ruTickHeight, ruPerUnit, ruText } from './ported/ruler.js';
import { isLab, labCheck, labSolve, labDraw, LAB_TYPES } from './labware.js';
import { lwDisplaced } from './ported/labware.js';
import { GA_CALIPER, GA_CALIPER_RANGE, GA_CALIPER_MAX_ZERO, gaCaliper, gaCaliperRead, gaSlideMarks, GA_MICROMETER_RANGE, GA_MICROMETER_MAX_ZERO, gaMicrometerRead, gaThimbleMarks, gaCorrected } from './ported/gauges.js';

const TYPES = ['thermometer', 'cylinder', 'spring', 'ruler', 'caliper', 'micrometer', ...LAB_TYPES, 'displacement'];
const UNITS = { thermometer: '°C', cylinder: 'mL', spring: 'N' };
const near = (x, s) => Math.abs(x / s - Math.round(x / s)) < 1e-6;
/**
 * { type: 'thermometer' | 'cylinder' | 'spring', value, min, max, step (one small tick), major? (a numbered tick;
 * default 5 or 10 steps), unit? (°C, mL, N) }. The value must be on the scale and on a tick or half way between two
 * (what a student can read).
 */
export const reading = {
  check(d) {
    const out = [];
    if (!d || !TYPES.includes(d.type)) return [`"type" must be one of ${TYPES.join(', ')}`];
    if (isLab(d)) return labCheck(d);
    if (d.type === 'displacement') return dispCheck(d);
    if (d.type === 'ruler') return rulerCheck(d);
    if (d.type === 'caliper' || d.type === 'micrometer') return gaugeCheck(d);
    if (!isNum(d.min) || !isNum(d.max) || d.max <= d.min) out.push('"min" and "max" must be numbers with min below max');
    if (!isNum(d.step, 1e-6)) out.push('"step" must be the size of one small tick, above 0');
    if (out.length) return out;
    const n = (d.max - d.min) / d.step;
    if (n > 120 || n < 2 || !near(d.max - d.min, d.step)) out.push('the scale must have 2 to 120 small ticks: (max − min) / step must be a whole number');
    if (d.major !== undefined && (!isNum(d.major, 1e-6) || !near(d.major, d.step) || !near(d.max - d.min, d.major))) out.push('"major" must be a whole number of steps that fits the scale');
    if (!isNum(d.value, d.min, d.max)) out.push(`"value" must be on the scale, from ${d.min} to ${d.max}`);
    else if (!near(d.value - d.min, d.step / 2)) out.push(`"value" ${d.value} is not on a tick or half way between two (a step is ${d.step}): a student cannot read it`);
    if (d.type === 'spring' && d.min < 0) out.push('a spring balance starts at 0 or more');
    if (springExtras(d)) out.push(...springCheck(d));
    else if (d.zero !== undefined || d.masses !== undefined || d.g !== undefined) out.push('"zero", "masses" and "g" are for a spring scale only');
    return out;
  },
  /** The reading (1.1.0): { value, unit }, and for a ruler also where the object starts and ends and the length as the
   *  ruler reads it ("3 3/8"); null when the data cannot be drawn. */
  solve(d) {
    if (reading.check(d).length) return null;
    if (isLab(d)) return labSolve(d);
    if (d.type === 'displacement') return dispSolve(d);
    if (d.type === 'caliper' || d.type === 'micrometer') return gaugeSolve(d);
    if (springExtras(d)) return springSolve(d);
    if (d.type !== 'ruler') return { type: d.type, value: d.value, unit: text(d.unit, 6) || UNITS[d.type] };
    const r = rulerOf(d);
    return { type: 'ruler', value: r.value, length: r.value, start: r.start, end: r.end, unit: r.unit, text: rulerText(r, 'en') };
  },
  draw(d, o) {
    if (isLab(d)) return labDraw(d, o);
    if (d.type === 'displacement') return dispDraw(d, o);
    if (d.type === 'ruler') return rulerDraw(d, o);
    if (d.type === 'caliper') return caliperDraw(d, o);
    if (d.type === 'micrometer') return micrometerDraw(d, o);
    if (springExtras(d)) return springDraw(d, o);
    const P = palette(o), lang = o.lang, unit = text(d.unit, 6) || UNITS[d.type], steps = Math.round((d.max - d.min) / d.step);
    const major = d.major || d.step * (steps % 10 === 0 && steps >= 30 ? 10 : 5), dp = Math.max(dec(d.step), dec(major));
    const H = Math.max(240, Math.min(420, steps * 7)), top = 30, bot = top + H, Y = v => bot - ((v - d.min) / (d.max - d.min)) * H;
    const kids = [], isMajor = v => near(v - d.min, major);
    const ticks = (x, dir, nums = true) => {
      for (let k = 0; k <= steps; k++) {
        const v = d.min + k * d.step, big = isMajor(v), half = !big && steps >= 10 && near(v - d.min, major / 2);
        const len = big ? 18 : half ? 12 : 8;
        kids.push(line(x, Y(v), x + dir * len, Y(v), P.ink, big ? 1.8 : 1.1));
        if (big && nums) kids.push(label(x + dir * (len + 6), Y(v), fmt(v, dp, lang), { anchor: dir > 0 ? 'start' : 'end', size: 13, weight: 600, colour: P.ink2 }));
      }
    };
    let W;
    if (d.type === 'thermometer') {
      const cx = 70, tw = 18, bulbR = 20;
      kids.push(path(`M ${cx - tw / 2} ${top - 10} A ${tw / 2} ${tw / 2} 0 0 1 ${cx + tw / 2} ${top - 10} L ${cx + tw / 2} ${bot + 6} A ${bulbR} ${bulbR} 0 1 1 ${cx - tw / 2} ${bot + 6} Z`, { fill: P.paper, stroke: P.ink, 'stroke-width': 2.5 }),
        node('circle', { cx, cy: bot + 6 + bulbR * 0.86, r: bulbR - 5, fill: P.red }),
        node('rect', { x: cx - 4, y: r2(Y(d.value)), width: 8, height: r2(bot + 14 - Y(d.value)), fill: P.red, class: 'of-level' }));
      ticks(cx + tw / 2 + 4, 1); W = 190;
      kids.push(label(cx, bot + bulbR * 2 + 34, '', {}));
    } else if (d.type === 'cylinder') {
      const x0 = 60, cw = 70, lvl = Y(d.value), men = Math.min(8, H / steps);
      kids.push(node('rect', { x: x0, y: r2(lvl - men), width: cw, height: r2(bot - lvl + men), fill: P.liquid, 'fill-opacity': 0.55 }),
        // the meniscus: curved up at the walls, its bottom exactly on the value
        path(`M ${x0} ${r2(lvl - men)} Q ${x0 + cw / 2} ${r2(lvl + men)} ${x0 + cw} ${r2(lvl - men)}`, { stroke: P.blue, 'stroke-width': 2.2, fill: P.paper, class: 'of-level' }),
        path(`M ${x0 - 8} ${top - 8} L ${x0} ${top} L ${x0} ${bot + 4} L ${x0 + cw} ${bot + 4} L ${x0 + cw} ${top} L ${x0 + cw + 4} ${top - 8}`, { stroke: P.ink, 'stroke-width': 2.5 }),
        node('rect', { x: x0 - 22, y: bot + 4, width: cw + 44, height: 10, rx: 3, fill: P.soft, stroke: P.ink, 'stroke-width': 2 }));
      ticks(x0, 1, false); for (let k = 0; k <= steps; k++) { const v = d.min + k * d.step; if (isMajor(v)) kids.push(label(x0 + cw + 10, Y(v), fmt(v, dp, lang), { size: 13, weight: 600, colour: P.ink2 })); }
      W = 200;
    } else {
      const x0 = 50, bw = 100, py = Y(d.value);
      kids.push(node('rect', { x: x0, y: top - 14, width: bw, height: H + 28, rx: 10, fill: P.soft, stroke: P.ink, 'stroke-width': 2.5 }),
        line(x0 + bw / 2, 4, x0 + bw / 2, top - 14, P.ink, 2.5), node('circle', { cx: x0 + bw / 2, cy: 6, r: 5, fill: 'none', stroke: P.ink, 'stroke-width': 2 }),
        // the spring down to the pointer
        path(springPath(x0 + 20, top - 6, py - 4), { stroke: P.muted, 'stroke-width': 1.8 }),
        node('polygon', { points: `${x0 + 20},${r2(py - 5)} ${x0 + 20},${r2(py + 5)} ${x0 + 34},${r2(py)}`, fill: P.red, class: 'of-level' }), line(x0 + 10, py, x0 + 20, py, P.red, 3),
        line(x0 + 20, py, x0 + 20, bot + 26, P.ink, 2.5), path(`M ${x0 + 20} ${bot + 26} q 0 14 -10 14`, { stroke: P.ink, 'stroke-width': 2.5 }));
      ticks(x0 + 34, 1); W = 190;
    }
    const blank = o.hide === true || o.hide === 'value';
    const words = blank ? `______ ${unit}` : `${fmt(d.value, dp + (near(d.value - d.min, d.step) ? 0 : 1), lang)} ${unit}`;
    const Ht = bot + (d.type === 'thermometer' ? 80 : 54);
    kids.push(label(W / 2, Ht - 16, words, { anchor: 'middle', size: 17, weight: 800, colour: P.ink, cls: 'of-value' }));
    return frame(W, Ht, kids, { ...o, kind: 'reading' }, o.title || `${d.type} reading`);
  },
};
function dec(x) { const s = String(Math.round(x * 1e6) / 1e6); return s.includes('.') ? s.split('.')[1].length : 0; }
function springPath(x, y0, y1) {
  const n = 10, h = (y1 - y0) / n; let s = `M ${x} ${r2(y0)}`;
  for (let i = 0; i < n; i++) s += ` l ${i % 2 ? -8 : 8} ${r2(h / 2)} l ${i % 2 ? 8 : -8} ${r2(h / 2)}`;
  return s;
}


// ---------------------------------------------------------------- the ruler (1.1.0)
// { type: 'ruler', value (the object's length), start (where its left end is; 0 by default), max (the ruler's length),
// step (its smallest marks: 1, 0.5 or 0.1 cm; 1, 1/2, 1/4, 1/8 or 1/16 in), unit ('cm' or 'in') }. A centimeter ruler is
// numbered every centimeter with a longer mark at each half; an inch ruler every inch, its marks shortening from halves
// down to sixteenths. Both ends sit on a mark (a metric length may end half way between two, read with one estimated
// digit), so the reading is what a student can read.
const RL_STEPS = { cm: [1, 0.5, 0.1], in: [1, 1 / 2, 1 / 4, 1 / 8, 1 / 16] };
const RL_KEYS = ['kind', 'hide', 'type', 'value', 'start', 'min', 'max', 'step', 'unit'];
const rlNear = (x, s) => Math.abs(x / s - Math.round(x / s)) < 1e-6;
/** A ruler's measures from its data -> { unit, step, max, start, value, end } (the value a number, or a fraction [n, d]). */
function rulerOf(d) {
  const num = x => (Array.isArray(x) && x.length === 2 && Number.isInteger(x[0]) && Number.isInteger(x[1]) && x[1] > 0 ? x[0] / x[1] : x);
  const unit = d.unit === undefined ? 'cm' : d.unit, value = num(d.value), start = d.start === undefined ? 0 : num(d.start), step = num(d.step);
  return { unit, step, max: d.max, start, value, end: start + value };
}
function rulerCheck(d) {
  const out = [], odd = Object.keys(d).filter(k => !RL_KEYS.includes(k));
  if (odd.length) return [`a ruler does not take "${odd[0]}" (it takes value, start, max, step, unit)`];
  const r = rulerOf(d);
  if (!['cm', 'in'].includes(r.unit)) return ['a ruler\'s "unit" must be "cm" or "in"'];
  if (d.min !== undefined && d.min !== 0) out.push('a ruler starts at 0: leave out "min" (put the object\'s left end at "start")');
  if (!RL_STEPS[r.unit].some(s => isNum(r.step) && Math.abs(s - r.step) < 1e-9)) out.push(r.unit === 'cm' ? '"step" (the smallest marks) must be 1, 0.5 or 0.1 cm' : '"step" (the smallest marks) must be 1, 1/2, 1/4, 1/8 or 1/16 inch, like [1, 8]');
  const most = r.unit === 'cm' ? 30 : 12;
  if (!(Number.isInteger(r.max) && r.max >= 2 && r.max <= most)) out.push(`"max" (the ruler's length) must be a whole number of ${r.unit === 'cm' ? 'centimeters from 2 to 30' : 'inches from 2 to 12'}`);
  if (out.length) return out;
  if (!isNum(r.start, 0, r.max) || !rlNear(r.start, r.step)) out.push(`"start" (the object's left end) must be on a mark of the ruler, from 0 to ${r.max}`);
  if (!isNum(r.value) || r.value <= 0) out.push('"value" (the object\'s length) must be a number above 0 (a fraction [n, d] for inches)');
  else if (r.end > r.max + 1e-9) out.push(`the object runs past the end of the ruler (it ends at ${fmt(r.end, 4)}, the ruler at ${r.max}): use a longer ruler or a smaller start`);
  else if (r.unit === 'in' ? !rlNear(r.value, r.step) : !rlNear(r.value, r.step / 2)) out.push(`"value" ${fmt(r.value, 4)} does not end ${r.unit === 'in' ? 'on a mark' : 'on a mark or half way between two'} (the marks are ${r.unit === 'in' ? `1/${Math.round(1 / r.step)} inch` : `${r.step} cm`} apart): a student cannot read it`);
  else if (r.value < r.step - 1e-9) out.push('the object must be at least one mark long');
  return out;
}
/** A length as a ruler reads it: "4.3" (cm, one decimal more for a half), or "3 3/8" (in). */
export const rulerText = (r, lang) => ruText(r.unit, r.step, r.value, (v, dp) => fmt(v, dp, lang));
function rulerDraw(d, o) {
  const P = palette(o), lang = o.lang, W = figWords(lang), r = rulerOf(d);
  const per = ruPerUnit(r.unit, r.max), end = 22, x0 = 20, top = 70, H = 76;
  const X = v => x0 + end + v * per, width = 2 * end + r.max * per, kids = [];
  // the object first, lying on the ruler's edge, its ends exactly at start and start + value
  const ox1 = X(r.start), ox2 = X(r.end), oh = 34;
  kids.push(node('rect', { x: r2(ox1), y: top - oh, width: r2(ox2 - ox1), height: oh, rx: 6, fill: o.print ? '#DDDDDD' : P.liquid, 'fill-opacity': o.print ? null : 0.6, stroke: P.ink, 'stroke-width': 2, class: 'of-level' }));
  kids.push(node('rect', { x: x0, y: top, width: r2(width), height: H, rx: 6, fill: o.print ? '#FFFFFF' : '#F6E7B8', stroke: P.ink, 'stroke-width': 2.2 }));
  for (const t of ruTicks(r.unit, r.max, r.step)) {
    const len = ruTickHeight(r.unit, t.level);
    kids.push(line(X(t.value), top, X(t.value), top + len, P.ink, t.level ? 1.1 : 1.8));
    if (!t.level) kids.push(label(X(t.value), top + len + 11, fmt(t.value, 0, lang), { anchor: 'middle', size: 13, weight: 600, colour: P.ink2 }));
  }
  kids.push(label(x0 + width - 6, top + H - 10, r.unit, { anchor: 'end', size: 12, weight: 600, colour: P.muted }));
  const blank = o.hide === true || o.hide === 'value';
  const words = blank ? `______ ${r.unit}` : `${rulerText(r, lang)} ${r.unit}`;
  const Wd = width + 2 * x0, Ht = top + H + 44;
  kids.push(label(Wd / 2, Ht - 18, words, { anchor: 'middle', size: 17, weight: 800, colour: P.ink, cls: 'of-value' }));
  return frame(Wd, Ht, kids, { ...o, kind: 'reading' }, o.title || W('ruler'));
}


// ---------------------------------------------------------------- the spring scale's extras (1.1.0)
// { type: "spring", ..., masses?: [grams, ...] (slotted masses on the hook: the reading must be their weight, plus the
// zero error), g?: 9.8 (N/kg), zero?: the zero error (what it reads with nothing hanging: drawn beside it, unloaded) }.
const springExtras = d => d.type === 'spring' && (d.masses !== undefined || d.zero !== undefined || d.g !== undefined);
function springCheck(d) {
  const out = [], g = d.g === undefined ? 9.8 : d.g, zero = d.zero || 0;
  if (d.unit !== undefined && d.unit !== 'N') out.push('a spring scale with "masses", "g" or "zero" reads in newtons ("unit": "N")');
  if (!isNum(g, 0.1, 100)) out.push('"g" must be the gravitational field strength in N/kg');
  if (d.zero !== undefined && (!isNum(d.zero, 1e-9, d.max) || !near(d.zero - d.min, d.step / 2))) out.push('"zero" (what it reads with nothing hanging) must be above 0 and on a tick or half way between two');
  if (d.masses !== undefined && (!Array.isArray(d.masses) || !d.masses.length || d.masses.length > 6 || d.masses.some(m => !isNum(m, 1, 100000)))) out.push('"masses" lists 1 to 6 masses in grams');
  if (out.length) return out;
  if (d.masses) {
    const w = (d.masses.reduce((a, m) => a + m, 0) / 1000) * g, want = w + zero;
    if (Math.abs(want - d.value) > 1e-6) out.push(`the masses weigh ${fmt(w, 4)} N${zero ? ` and the zero error is ${fmt(zero, 4)} N` : ''}: the pointer reads ${fmt(want, 4)} N, not ${fmt(d.value, 4)} (change the masses, "g" or the value)`);
  }
  return out;
}
function springSolve(d) {
  const g = d.g === undefined ? 9.8 : d.g, zero = d.zero || 0, out = { type: 'spring', value: d.value, unit: 'N', zero, corrected: Math.round((d.value - zero) * 1e9) / 1e9 };
  if (d.masses) Object.assign(out, { mass: d.masses.reduce((a, m) => a + m, 0), g, weight: (d.masses.reduce((a, m) => a + m, 0) / 1000) * g });
  return out;
}
/** The spring scale as before (its base drawing, unchanged), with its slotted masses hanging from the hook and, with a
 *  zero error, the same scale beside it with nothing hanging. */
function springDraw(d, o) {
  const P = palette(o), lang = o.lang, base = { kind: d.kind, type: 'spring', value: d.value, min: d.min, max: d.max, step: d.step, major: d.major };
  const steps = Math.round((d.max - d.min) / d.step), bot = 30 + Math.max(240, Math.min(420, steps * 7)), hookY = bot + 40, x0 = 70 - 10;
  const inner = (data, keepValue) => { const f = reading.draw(data, o); return f.kids.slice(2).filter(k => keepValue || !(k.attrs && k.attrs.class === 'of-value')); };
  const kids = [], massH = d.masses ? 22 * d.masses.length + 30 : 0, Ht = hookY + massH + 46;
  let dx = 0;
  if (d.zero) {
    kids.push(node('g', { class: 'of-unloaded' }, inner({ ...base, value: d.zero }, false)), label(95, hookY + 24, figWords(lang)('zeroError'), { anchor: 'middle', size: 13, colour: P.ink2 }));
    dx = 200;
  }
  const loaded = inner(base, true), val = loaded.find(k => k.attrs && k.attrs.class === 'of-value');
  kids.push(node('g', { transform: `translate(${dx} 0)` }, loaded.filter(k => k !== val)));
  if (d.masses) {
    // the hanger and its slotted masses, the heaviest at the bottom
    const cx = dx + x0, list = d.masses.slice().sort((a, b) => a - b);
    kids.push(line(cx, hookY, cx, hookY + 14, P.ink, 2));
    list.forEach((m, i) => {
      const y = hookY + 14 + i * 22, w = 34 + Math.min(30, Math.sqrt(m) * 2);
      kids.push(node('rect', { x: r2(cx - w / 2), y, width: r2(w), height: 20, rx: 3, fill: P.soft, stroke: P.ink, 'stroke-width': 1.8, class: 'of-mass' }), label(cx, y + 10, `${fmt(m, 0, lang)} g`, { anchor: 'middle', size: 11, colour: P.ink }));
    });
  }
  if (val) { val.attrs.x = dx + 95; val.attrs.y = Ht - 16; kids.push(val); }
  return frame(dx + 190, Ht, kids, { ...o, kind: 'reading' }, o.title || 'spring reading');
}

// ---------------------------------------------------------------- the vernier caliper and the micrometer (1.1.0)
// caliper: { type: "caliper", value: the reading in mm (0 to 150, on the least count), leastCount: 0.1 | 0.05 | 0.02,
// zero?: the zero error in mm (what it reads with its jaws closed, up to 0.5 either way; drawn beside it, closed) }.
// micrometer: { type: "micrometer", value: the reading in mm (0 to 25, to 0.01; or to 0.001 with estimate: true, one
// digit read by eye past the thimble's marks), zero?: up to 0.05 either way }. A close-up of the scales: the main scale
// and the sliding scale, or the sleeve and the thimble, set exactly at the reading, so the mark that lines up (or the
// thimble mark on the datum line) is the true one. hide: the reading under it is a blank line.
const GA_KEYS = ['kind', 'hide', 'type', 'value', 'leastCount', 'zero', 'estimate'];
const gaLc = d => (d.type === 'caliper' ? d.leastCount : d.estimate ? 0.001 : 0.01);
const gaDec = d => (d.type === 'caliper' ? GA_CALIPER[d.leastCount].decimals : d.estimate ? 3 : 2);
function gaugeCheck(d) {
  const out = [], cal = d.type === 'caliper';
  for (const k of Object.keys(d)) if (!GA_KEYS.includes(k) || (k === 'leastCount' && !cal) || (k === 'estimate' && cal)) out.push(`a ${d.type} does not take "${k}"`);
  if (cal && !GA_CALIPER[d.leastCount]) out.push('a caliper\'s "leastCount" must be 0.1, 0.05 or 0.02 (mm)');
  if (!cal && d.estimate !== undefined && typeof d.estimate !== 'boolean') out.push('"estimate" must be true or false');
  if (out.length) return out;
  const lc = gaLc(d), range = cal ? GA_CALIPER_RANGE : GA_MICROMETER_RANGE, most = cal ? GA_CALIPER_MAX_ZERO : GA_MICROMETER_MAX_ZERO, zero = d.zero || 0;
  const onLc = x => Math.abs(x / lc - Math.round(x / lc)) < 1e-6;
  if (d.zero !== undefined && (!isNum(d.zero, -most, most) || !onLc(d.zero) || d.zero === 0)) out.push(`"zero" (the zero error) must be a multiple of ${lc} mm, not 0, at most ${most} mm either way`);
  if (!isNum(d.value, Math.max(0, zero), range)) out.push(`"value" (the reading in mm) must be from ${fmt(Math.max(0, zero), 3)} to ${range}`);
  else if (!onLc(d.value)) out.push(`"value" ${d.value} is not a multiple of the least count, ${lc} mm: a student cannot read it`);
  return out;
}
function gaugeSolve(d) {
  const dec = gaDec(d), zero = d.zero || 0, out = { type: d.type, value: d.value, unit: 'mm', leastCount: gaLc(d), zero, corrected: gaCorrected(d.value, zero, dec) };
  if (d.type === 'caliper') Object.assign(out, gaCaliperRead(gaCaliper(d.leastCount), d.value));
  else Object.assign(out, gaMicrometerRead(d.value));
  return out;
}
const gaWords = (d, o) => (o.hide === true || o.hide === 'value' ? '______ mm' : `${fmt(d.value, gaDec(d), o.lang)} mm`);
/** A caliper's scales at a reading, from y: the main scale (numbered in cm) over the sliding scale, mm -> x. */
function caliperScales(v, reading, y, P, lang) {
  const lo = Math.floor(reading) - 5, hi = Math.ceil(reading + v.length) + 4, K = 560 / (hi - lo), X = mm => 20 + (mm - lo) * K, kids = [];
  kids.push(node('rect', { x: 14, y, width: r2(X(hi) - 8), height: 46, fill: P.soft, stroke: P.ink, 'stroke-width': 1.6 }));
  for (let mm = lo; mm <= hi; mm++) {
    if (mm < 0) continue;
    const big = mm % 10 === 0, mid = mm % 5 === 0;
    kids.push(line(X(mm), y + 46, X(mm), y + 46 - (big ? 22 : mid ? 16 : 10), P.ink, big ? 1.6 : 1.1));
    if (big) kids.push(label(X(mm), y + 13, fmt(mm / 10, 0, lang), { anchor: 'middle', size: 13, weight: 700, colour: P.ink }));
  }
  kids.push(node('rect', { x: r2(X(reading) - 10), y: y + 46, width: r2(v.length * K + 20), height: 40, fill: P.paper, stroke: P.ink, 'stroke-width': 1.6, class: 'of-slider' }));
  for (const m of gaSlideMarks(v, reading)) {
    kids.push(line(X(m.at), y + 46, X(m.at), y + 46 + (m.number !== undefined ? 18 : 11), P.blue, m.number !== undefined ? 1.6 : 1.1));
    if (m.number !== undefined) kids.push(label(X(m.at), y + 76, m.number, { anchor: 'middle', size: 11, weight: 600, colour: P.blue }));
  }
  kids.push(label(X(hi), y + 13, 'cm', { anchor: 'end', size: 11, colour: P.muted }));
  return kids;
}
function caliperDraw(d, o) {
  const P = palette(o), lang = o.lang, v = gaCaliper(d.leastCount), kids = [];
  let y = 16;
  if (d.zero) { kids.push(label(300, y + 4, figWords(lang)('zeroError'), { anchor: 'middle', size: 13, colour: P.ink2 }), node('g', { class: 'of-closed' }, caliperScales(v, d.zero, y + 14, P, lang))); y += 120; }
  kids.push(node('g', { class: 'of-level' }, caliperScales(v, d.value, y, P, lang)));
  const Ht = y + 130;
  kids.push(label(300, Ht - 18, gaWords(d, o), { anchor: 'middle', size: 17, weight: 800, colour: P.ink, cls: 'of-value' }));
  return frame(600, Ht, kids, { ...o, kind: 'reading' }, o.title || figWords(lang)('caliper'));
}
/** A micrometer's sleeve and thimble at a reading, the datum line at y. */
function micrometerScales(reading, y, P, lang) {
  const K = 44, show = 6, lo = reading - show, X = mm => 30 + (mm - lo) * K, edge = X(reading), R = 70, kids = [];
  kids.push(node('rect', { x: 20, y: y - 26, width: r2(edge - 20), height: 52, fill: P.soft, stroke: P.ink, 'stroke-width': 1.6 }), line(20, y, edge, y, P.ink, 1.6));
  for (let h = Math.ceil(lo * 2) / 2; h < reading - 1e-9; h += 0.5) {
    if (h < -1e-9) continue;
    const whole = Math.abs(h - Math.round(h)) < 1e-9;
    kids.push(whole ? line(X(h), y, X(h), y - 14, P.ink, 1.4) : line(X(h), y, X(h), y + 11, P.ink, 1.2));
    if (whole && Math.round(h) % 5 === 0) kids.push(label(X(h), y - 20, fmt(Math.round(h), 0, lang), { anchor: 'middle', size: 12, weight: 700, colour: P.ink }));
  }
  // the thimble: its bevelled edge at the reading, its marks round it seen side on
  kids.push(node('path', { d: `M ${r2(edge)} ${r2(y - R)} L ${r2(edge + 120)} ${r2(y - R)} L ${r2(edge + 120)} ${r2(y + R)} L ${r2(edge)} ${r2(y + R)} Z`, fill: P.paper, stroke: P.ink, 'stroke-width': 1.8, class: 'of-thimble' }));
  for (const m of gaThimbleMarks(reading)) {
    const yy = y - R * Math.sin(m.angle), long = m.j % 5 === 0;
    kids.push(line(edge, yy, edge + (long ? 20 : 12), yy, P.blue, long ? 1.6 : 1.1));
    if (long && Math.abs(m.angle) < 1.2) kids.push(label(edge + 26, yy, String(m.j), { size: 12, weight: 600, colour: P.blue }));
  }
  return { kids, w: edge + 140 };
}
function micrometerDraw(d, o) {
  const P = palette(o), lang = o.lang, kids = [];
  let y = 90, w = 0;
  if (d.zero) { const z = micrometerScales(d.zero, y, P, lang); kids.push(label(30, 14, figWords(lang)('zeroError'), { size: 13, colour: P.ink2 }), node('g', { class: 'of-closed' }, z.kids)); w = z.w; y += 170; }
  const s = micrometerScales(d.value, y, P, lang); kids.push(node('g', { class: 'of-level' }, s.kids)); w = Math.max(w, s.w);
  const Ht = y + 120;
  kids.push(label(w / 2, Ht - 18, gaWords(d, o), { anchor: 'middle', size: 17, weight: 800, colour: P.ink, cls: 'of-value' }));
  return frame(w, Ht, kids, { ...o, kind: 'reading' }, o.title || figWords(lang)('micrometer'));
}

// ---------------------------------------------------------------- volume by displacement (1.2.0)
// { type: "displacement", before, after (the water's level without and with the object in, mL), min?: 0, max, step,
// major?, unit?: "mL", object?: "rock" | "marbles", count?: 1 to 5 marbles }. Two measuring cylinders as the cylinder
// reading draws them, side by side; each reading on a mark or half way between two, after above before. The object
// lies under the water in the second, its drawn area exactly the area of the water it pushed up (the rise across the
// tube), so it must fit under the surface (refused otherwise: start with more water). OF.solve gives the object's
// volume, after less before.
const DISP_KEYS = ['kind', 'hide', 'type', 'before', 'after', 'min', 'max', 'step', 'major', 'unit', 'object', 'count'];
/** The cylinder's scale for these readings (as the cylinder reading draws it) and where the object goes in it. */
function dispGeom(d) {
  const min = d.min ?? 0, steps = Math.round((d.max - min) / d.step), H = Math.max(240, Math.min(420, steps * 7)), bot = 30 + H, x0 = 60, cw = 70;
  const Y = v => bot - ((v - min) / (d.max - min)) * H, rise = Y(d.before) - Y(d.after), area = cw * rise, floor = bot + 2, room = floor - (Y(d.after) + 4);
  if ((d.object || 'rock') === 'rock') { const w = 0.72 * cw, h = area / ((Math.PI / 4) * w); return { Y, x0, cw, bot, kind: 'rock', w, h, fits: h <= room, floor }; }
  const n = d.count ?? 2, r = Math.sqrt(area / (n * Math.PI)), per = Math.max(1, Math.floor((cw - 4) / (2 * r + 1))), rows = Math.ceil(n / per);
  return { Y, x0, cw, bot, kind: 'marbles', n, r, per, fits: 2 * r <= cw - 4 && rows * 2 * r <= room, floor };
}
function dispCheck(d) {
  const odd = Object.keys(d).filter(k => !DISP_KEYS.includes(k));
  if (odd.length) return [`a displacement reading does not take "${odd[0]}" (it takes before, after, min, max, step, major, unit, object, count)`];
  if (d.object !== undefined && !['rock', 'marbles'].includes(d.object)) return ['"object" must be "rock" or "marbles"'];
  if (d.count !== undefined && (d.object !== 'marbles' || !Number.isInteger(d.count) || d.count < 1 || d.count > 5)) return ['"count" is the marbles, 1 to 5 (with "object": "marbles")'];
  const out = [], cyl = v => reading.check({ type: 'cylinder', value: v, min: d.min ?? 0, max: d.max, step: d.step, major: d.major }).map(m => m.replace('"value"', '').trim());
  for (const k of ['before', 'after']) for (const m of cyl(d[k])) out.push(`"${k}": ${m}`);
  if (out.length) return out;
  if (d.after <= d.before) return ['"after" (with the object in) must be above "before"'];
  if (!dispGeom(d).fits) out.push('the object would stick out of the water (its volume is the rise, so it is too tall for the water below the surface): start with more water');
  return out;
}
function dispSolve(d) {
  const dp = Math.max(dec(d.step), dec(d.step / 2));
  return { type: 'displacement', before: d.before, after: d.after, volume: lwDisplaced(d.before, d.after, dp), value: lwDisplaced(d.before, d.after, dp), unit: text(d.unit, 6) || 'mL' };
}
function dispDraw(d, o) {
  const P = palette(o), lang = o.lang, W = figWords(lang), g = dispGeom(d), unit = text(d.unit, 6) || 'mL', blank = o.hide === true || o.hide === 'value';
  const base = { type: 'cylinder', min: d.min ?? 0, max: d.max, step: d.step, major: d.major };
  const inner = v => { const f = reading.draw({ ...base, value: v }, o); return f.kids.slice(2).filter(k => !(k.attrs && k.attrs.class === 'of-value')); };
  const dp = Math.max(dec(d.step), dec(d.step / 2)), say = v => (blank ? `______ ${unit}` : `${fmt(v, dp, lang)} ${unit}`);
  const right = inner(d.after), obj = [];
  if (g.kind === 'rock') obj.push(node('ellipse', { cx: r2(g.x0 + g.cw / 2), cy: r2(g.floor - g.h / 2), rx: r2(g.w / 2), ry: r2(g.h / 2), fill: o.print ? '#999999' : '#8A7F6E', stroke: P.ink, 'stroke-width': 1.6, class: 'of-object' }));
  else for (let i = 0; i < g.n; i++) {
    const row = Math.floor(i / g.per), inRow = Math.min(g.per, g.n - row * g.per), col = i % g.per, left = g.x0 + (g.cw - inRow * (2 * g.r + 1)) / 2;
    obj.push(node('circle', { cx: r2(left + g.r + 0.5 + col * (2 * g.r + 1)), cy: r2(g.floor - g.r - row * 2 * g.r), r: r2(g.r), fill: o.print ? '#CCCCCC' : P.fill, stroke: P.ink, 'stroke-width': 1.4, class: 'of-object' }));
  }
  right.splice(2, 0, ...obj);
  const Ht = g.bot + 96, kids = [node('g', { class: 'of-before' }, inner(d.before)), node('g', { class: 'of-after', transform: 'translate(200 0)' }, right),
    label(95, 12, W('before'), { anchor: 'middle', size: 14, colour: P.ink2 }), label(295, 12, W('after'), { anchor: 'middle', size: 14, colour: P.ink2 }),
    label(95, g.bot + 40, say(d.before), { anchor: 'middle', size: 15, weight: 700, colour: P.ink, cls: 'of-value' }), label(295, g.bot + 40, say(d.after), { anchor: 'middle', size: 15, weight: 700, colour: P.ink, cls: 'of-value' }),
    label(195, Ht - 18, `${W('objectVolume')} = ${say(d.after - d.before)}`, { anchor: 'middle', size: 16, weight: 800, colour: P.ink, cls: 'of-value' })];
  return frame(390, Ht, kids, { ...o, kind: 'reading' }, o.title || W('dispReading'));
}

export const READINGS = { reading };
