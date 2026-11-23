// Oomba Figures: the lever (1.7.0, the physics pack). A class 1, 2 or 3 lever: a beam on a fulcrum with the load (a
// block, or a force arrow) and the effort, drawn to scale from the two arms (ported/lever.js), their names and values
// above them, and the arms' dimension lines under the ground. The effort is never given: an ideal lever balances, so
// OF.solve works it out from the load and the arms, with the mechanical advantage and which part is in the middle.
// hide: "effort" (its value is "?"), "load", "arms" (the arms' lengths are "?"), true (the effort and the arms).
import { node, label, line, frame, palette, fmt, isNum, text, hides } from './svg.js';
import { mechWords, keysCheck, boolCheck, oneOf, lbl, hatched, block, force, dimension } from './mech.js';
import { LV_BEAM, LV_OVERHANG, LV_SPAN, lvArmsSuit, lvSums, lvDrawnArms, lvArrowLengths } from './ported/lever.js';

const LV_KEYS = ['kind', 'hide', 'class', 'effortArm', 'loadArm', 'unit', 'load', 'loadUnit', 'loadShown', 'names', 'values', 'arms', 'labels', 'heading'];
const LV_LABELS = ['effort', 'load', 'effortArm', 'loadArm', 'effortName', 'loadName', 'fulcrumName'];
const clsOf = d => Number(d.class === undefined ? 1 : d.class);
/** A worked-out value: as it is when it comes out even to 2 decimals, else to 3 significant figures. */
export const sig3 = v => (Math.abs(v - Math.round(v * 100) / 100) < 1e-9 ? v : Number(v.toPrecision(3)));

export const lever = {
  check(d) {
    const out = keysCheck(d, LV_KEYS, 'a lever');
    if (d.class !== undefined && ![1, 2, 3, '1', '2', '3'].includes(d.class)) out.push('"class" must be 1, 2 or 3 (which of the fulcrum, the load and the effort is in the middle)');
    for (const k of ['effortArm', 'loadArm']) if (!isNum(d[k], 0.001, 100000)) out.push(`"${k}" must be its distance from the fulcrum, above 0`);
    if (!isNum(d.load, 0.001, 1000000)) out.push('"load" must be the load, above 0 (in "loadUnit": N, lb, kg or g)');
    out.push(...oneOf(d, 'unit', ['m', 'cm', 'mm', 'in', 'ft']), ...oneOf(d, 'loadUnit', ['N', 'lb', 'kg', 'g']), ...oneOf(d, 'loadShown', ['block', 'arrow']), ...boolCheck(d, ['names', 'values', 'arms']));
    if (d.labels !== undefined && (!d.labels || typeof d.labels !== 'object' || Array.isArray(d.labels) || Object.keys(d.labels).some(k => !LV_LABELS.includes(k)))) out.push(`"labels" can set ${LV_LABELS.join(', ')} (short words such as "?" or "x")`);
    if (!out.length && !lvArmsSuit(clsOf(d), d.effortArm, d.loadArm)) out.push(clsOf(d) === 2 ? 'a class 2 lever has the load between the fulcrum and the effort, so its effort arm is the longer' : 'a class 3 lever has the effort between the fulcrum and the load, so its load arm is the longer');
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short text');
    return out;
  },
  /** The class, what is in the middle, the load's weight (and its mass), the effort that balances it, the mechanical
   *  advantage (effort arm ÷ load arm) and which way the effort pushes. */
  solve(d) {
    if (lever.check(d).length) return null;
    const cls = clsOf(d), s = lvSums(d.effortArm, d.loadArm, d.load, d.loadUnit || 'N');
    return { class: cls, middle: ['fulcrum', 'load', 'effort'][cls - 1], effortArm: d.effortArm, loadArm: d.loadArm, load: d.load, weight: s.weight, ...(s.mass ? { mass: s.kg } : {}),
      effort: s.effort, advantage: s.advantage, forceUnit: s.forceUnit, effortDir: cls === 1 ? 'down' : 'up', multiplies: s.advantage > 1 ? 'force' : s.advantage < 1 ? 'distance' : 'neither' };
  },
  draw(d, o) {
    const P = palette(o), lang = o.lang, W = mechWords(lang), cls = clsOf(d), unit = d.unit || 'm', lu = d.loadUnit || 'N', s = lvSums(d.effortArm, d.loadArm, d.load, lu);
    const L = d.labels || {}, vals = d.values !== false, top = d.heading ? 30 : 0;
    const arms = lvDrawnArms(cls, d.effortArm, d.loadArm), left = cls === 1 ? (640 - LV_BEAM) / 2 : (640 - LV_BEAM) / 2 + 30;
    const x = cls === 1 ? { load: left + LV_OVERHANG, fulcrum: left + LV_OVERHANG + arms.load, effort: left + LV_OVERHANG + LV_SPAN }
      : { fulcrum: left + LV_OVERHANG, load: left + LV_OVERHANG + arms.load, effort: left + LV_OVERHANG + arms.effort };
    const beamTop = 204, th = 14, under = beamTop + th, groundY = under + 54, lens = lvArrowLengths(s.effort, s.weight), asBlock = d.loadShown !== 'arrow' || s.mass;
    const g = [];
    // the fulcrum on its ground, the beam
    g.push(node('polygon', { points: `${x.fulcrum},${under} ${x.fulcrum - 27},${groundY} ${x.fulcrum + 27},${groundY}`, fill: P.soft, stroke: P.ink, 'stroke-width': 2, 'stroke-linejoin': 'round', class: 'of-fulcrum' }),
      hatched(x.fulcrum - 42, x.fulcrum + 42, groundY, P, true),
      node('rect', { x: left, y: beamTop, width: LV_BEAM, height: th, rx: 2, fill: P.paper, stroke: P.ink, 'stroke-width': 2, class: 'of-beam' }));
    // the load and the effort
    const bw = 54, bh = 46, loadTop = asBlock ? beamTop - bh : beamTop - lens.load;
    if (asBlock) g.push(block(x.load, beamTop, bw, bh, '', P));
    else g.push(node('g', { class: 'of-load' }, force(x.load, beamTop - lens.load, x.load, beamTop - 1, P.ink)));
    const effortTop = beamTop - lens.effort;
    g.push(node('g', { class: 'of-effort' }, cls === 1 ? force(x.effort, effortTop, x.effort, beamTop - 1, P.red) : force(x.effort, beamTop, x.effort, effortTop, P.red)));
    // names over values over each force; columns close together move apart
    const hidden = k => o.hide === true ? ['effort', 'effortArm', 'loadArm'].includes(k) : hides(o, k === 'effortArm' || k === 'loadArm' ? 'arms' : k);
    const fmtV = v => fmt(sig3(v), 3, lang);
    const loadV = hidden('load') ? '?' : lbl(L.load, vals ? `${fmtV(d.load)} ${lu}` : ''), effortV = hidden('effort') ? '?' : lbl(L.effort, vals ? `${fmtV(s.effort)} ${s.forceUnit}` : '');
    const names = d.names !== false, loadN = names ? lbl(L.loadName, W('load')) : '', effortN = names ? lbl(L.effortName, W('effort')) : '', fulcrumN = names ? lbl(L.fulcrumName, W('fulcrum')) : '';
    const wOf = (...ws) => Math.max(0, ...ws.map(w => 0.56 * 15 * [...String(w)].length));
    const col = { load: x.load, effort: x.effort };
    if (cls !== 1) {
      const [inner, outer] = cls === 2 ? ['load', 'effort'] : ['effort', 'load'], wi = wOf(...(inner === 'load' ? [loadV, loadN] : [effortV, effortN])), wo = wOf(...(outer === 'load' ? [loadV, loadN] : [effortV, effortN]));
      const need = (wi + wo) / 2 + 12 - (x[outer] - x[inner]);
      if (need > 0) { col[outer] = Math.min(636 - wo / 2, x[outer] + need / 2); col[inner] = x[inner] - (need - (col[outer] - x[outer])); }
    }
    const stack = (cx, topY, value, nm, c) => {
      const out = [], vy = topY - 14;
      if (value) out.push(label(cx, vy, value, { anchor: 'middle', size: 15, colour: c, halo: P.paper, cls: 'of-value' }));
      if (nm) out.push(label(cx, value ? vy - 20 : vy, nm, { anchor: 'middle', size: 15, colour: c, halo: P.paper, cls: 'of-name' }));
      return out;
    };
    g.push(...stack(col.load, Math.min(loadTop, beamTop - 4), loadV, loadN, P.ink), ...stack(col.effort, effortTop, effortV, effortN, P.red));
    if (fulcrumN) {
      const right = cls === 1 ? arms.effort >= arms.load : false, fx = x.fulcrum + (right ? 30 : -30);
      g.push(label(fx, (under + groundY) / 2 + 4, fulcrumN, { anchor: right ? 'start' : 'end', size: 15, colour: P.ink, halo: P.paper, cls: 'of-name' }));
    }
    // the arms' dimension lines under the ground
    if (d.arms !== false) {
      const armWords = k => (hidden(k) ? '?' : lbl(L[k], `${fmt(d[k], 3, lang)} ${unit}`));
      const y1 = groundY + 28, wit = xx => line(xx, under + 2, xx, y1 + (cls === 1 ? 6 : 34), P.muted, 1, { 'stroke-dasharray': '3 3' });
      g.push(wit(x.load), wit(x.effort), wit(x.fulcrum));
      if (cls === 1) g.push(dimension(x.load, y1, x.fulcrum, y1, armWords('loadArm'), P), dimension(x.fulcrum, y1, x.effort, y1, armWords('effortArm'), P));
      else {
        const [near, far] = cls === 2 ? ['load', 'effort'] : ['effort', 'load'];
        g.push(dimension(x.fulcrum, y1, x[near], y1, armWords(`${near}Arm`), P), dimension(x.fulcrum, y1 + 34, x[far], y1 + 34, armWords(`${far}Arm`), P));
      }
    }
    const kids = [];
    if (d.heading) kids.push(label(320, 18, text(d.heading, 60), { anchor: 'middle', size: 15, colour: P.ink }));
    kids.push(node('g', { transform: top ? `translate(0 ${top})` : null }, g));
    return frame(640, 400 + top, kids, { ...o, kind: 'lever' }, o.title || W('lever'));
  },
};
export const LEVER_KINDS = { lever };
