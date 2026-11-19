// Oomba Figures: reading a scale. A thermometer, a measuring cylinder (read at the bottom of the meniscus) and a spring
// balance (newton meter). The scale is evenly spaced from min to max with a tick every "step" and a number every
// "major"; the liquid, the meniscus or the pointer sits exactly at the value. hide: the reading under the figure is a
// blank line (the student writes it).
import { node, label, line, path, frame, palette, fmt, isNum, text, r2 } from './svg.js';

const TYPES = ['thermometer', 'cylinder', 'spring'];
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
    if (!isNum(d.min) || !isNum(d.max) || d.max <= d.min) out.push('"min" and "max" must be numbers with min below max');
    if (!isNum(d.step, 1e-6)) out.push('"step" must be the size of one small tick, above 0');
    if (out.length) return out;
    const n = (d.max - d.min) / d.step;
    if (n > 120 || n < 2 || !near(d.max - d.min, d.step)) out.push('the scale must have 2 to 120 small ticks: (max − min) / step must be a whole number');
    if (d.major !== undefined && (!isNum(d.major, 1e-6) || !near(d.major, d.step) || !near(d.max - d.min, d.major))) out.push('"major" must be a whole number of steps that fits the scale');
    if (!isNum(d.value, d.min, d.max)) out.push(`"value" must be on the scale, from ${d.min} to ${d.max}`);
    else if (!near(d.value - d.min, d.step / 2)) out.push(`"value" ${d.value} is not on a tick or half way between two (a step is ${d.step}): a student cannot read it`);
    if (d.type === 'spring' && d.min < 0) out.push('a spring balance starts at 0 or more');
    return out;
  },
  draw(d, o) {
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

export const READINGS = { reading };
