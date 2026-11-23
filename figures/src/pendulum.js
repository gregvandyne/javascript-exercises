// Oomba Figures: the pendulum (1.7.0, the physics pack). One bob at an angle θ from the vertical, or the swing: the bob
// where it is released, at the bottom and at the same height on the far side, with its dashed path, the angle, the
// string's length L and the height h it drops; on one bob the tension and weight, and weight's components along the
// string and the path. Laid out by ported/pendulum.js. With a length (m), OF.solve gives the period 2π√(L/g), the
// height h = L(1 − cos θ) and the speed at the bottom √(2gh); with a mass too, the energy mgh, the tension at the
// release point and at the bottom, and weight's components. hide: "height", "length", "angle" (that mark's value is
// left off: its letter shows), "values" or true (every value: only the letters).
import { node, label, line, path, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { mechWords, keysCheck, boolCheck, oneOf, hatched, ball, force, motion, dimension } from './mech.js';
import { PD_W, PD_H, PD_LENGTH, PD_BOB_R, PD_MIN_SHOWN_ACROSS, PD_VELOCITY, PD_ARC_R, PD_HEIGHT_GAP, pdWeightOf, pdBobAt, pdPivot } from './ported/pendulum.js';

const PD_KEYS = ['kind', 'hide', 'picture', 'angle', 'side', 'length', 'mass', 'g', 'arc', 'angleMark', 'heightMark', 'letters', 'forces', 'velocity', 'values', 'heading'];
const pdG = d => (d.g === undefined ? 9.8 : d.g);

export const pendulum = {
  check(d) {
    const out = keysCheck(d, PD_KEYS, 'a pendulum'), swing = (d.picture || 'swing') === 'swing';
    out.push(...oneOf(d, 'picture', ['one', 'swing']), ...oneOf(d, 'side', ['left', 'right']), ...oneOf(d, 'forces', ['none', 'tensionWeight', 'components']),
      ...boolCheck(d, ['arc', 'angleMark', 'heightMark', 'letters', 'velocity', 'values']));
    if (d.angle !== undefined && !isNum(d.angle, swing ? 15 : 5, 75)) out.push(`"angle" must be ${swing ? 15 : 5} to 75 degrees from the vertical${swing ? ' (in the swing the three bobs overlap below 15)' : ''}`);
    if (d.length !== undefined && !isNum(d.length, 0.001, 10000)) out.push('"length" must be the string\'s length in m, above 0');
    if (d.mass !== undefined && !isNum(d.mass, 0.001, 100000)) out.push('"mass" must be the bob\'s mass in kg, above 0');
    if (d.g !== undefined && !isNum(d.g, 0.1, 100)) out.push('"g" must be g in m/s²');
    if (swing && d.forces !== undefined && d.forces !== 'none') out.push('forces are drawn on one bob (picture "one")');
    if (!swing && d.velocity) out.push('the velocity is drawn at the bottom of the swing (picture "swing")');
    if (!swing && d.letters) out.push('the letters A, B and C name the swing\'s three bobs (picture "swing")');
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short text');
    return out;
  },
  /** The angle, weight's components (with a mass), and with a length the period, the frequency, the height it drops,
   *  the speed at the bottom (fastest there, at B) and, with a mass, its energy and the tensions. */
  solve(d) {
    if (pendulum.check(d).length) return null;
    const th = ((d.angle === undefined ? 30 : d.angle) * Math.PI) / 180, g = pdG(d), m = d.mass, out = { angle: d.angle === undefined ? 30 : d.angle, g, fastest: 'B', slowest: 'A' };
    if (m !== undefined) Object.assign(out, { mass: m, weight: m * g, along: m * g * Math.cos(th), across: m * g * Math.sin(th), tensionRelease: m * g * Math.cos(th) });
    if (d.length !== undefined) {
      const L = d.length, h = L * (1 - Math.cos(th)), v = Math.sqrt(2 * g * h);
      Object.assign(out, { length: L, period: 2 * Math.PI * Math.sqrt(L / g), height: h, speed: v });
      out.frequency = 1 / out.period;
      if (m !== undefined) Object.assign(out, { energy: m * g * h, kinetic: m * g * h, tensionBottom: m * g + (m * v * v) / L });
    }
    return out;
  },
  draw(d, o) {
    const P = palette(o), lang = o.lang, W = mechWords(lang), swing = (d.picture || 'swing') === 'swing', theta = d.angle === undefined ? 30 : d.angle, sign = d.side === 'left' ? -1 : 1;
    const arcOn = d.arc === undefined ? swing : d.arc, hMark = d.heightMark === undefined ? swing : d.heightMark, aMark = d.angleMark !== false, forces = !swing && d.forces && d.forces !== 'none';
    const all = o.hide === true || hides(o, 'values') || d.values === false, show = k => !all && !hides(o, k), s = pendulum.solve(d) || {};
    const rad = (theta * Math.PI) / 180, top = d.heading ? 30 : 0, Pv = pdPivot(swing, theta, d.side, arcOn, hMark, aMark, forces), low = { x: Pv.x, y: Pv.y + PD_LENGTH };
    const rel = pdBobAt(Pv, sign * theta), far = pdBobAt(Pv, -sign * theta), g = [];
    g.push(hatched(Pv.x - 70, Pv.x + 70, Pv.y, P));
    if (arcOn) { const a = pdBobAt(Pv, -theta), b = pdBobAt(Pv, theta); g.push(path(`M ${r2(a.x)} ${r2(a.y)} A ${PD_LENGTH} ${PD_LENGTH} 0 0 0 ${r2(b.x)} ${r2(b.y)}`, { stroke: P.muted, 'stroke-width': 1.6, 'stroke-dasharray': '6 5', class: 'of-path' })); }
    if (aMark && !swing) g.push(line(Pv.x, Pv.y, Pv.x, forces && !arcOn && !hMark ? rel.y : low.y, P.muted, 1.3, { 'stroke-dasharray': '4 4' }));
    if (hMark) {
      const x = r2(far.x - sign * (PD_BOB_R + PD_HEIGHT_GAP)), past = x - sign * 6;
      const words = show('height') && s.height !== undefined ? `h = ${fmt(s.height, 2, lang)} m` : 'h';
      g.push(line(rel.x, rel.y, past, rel.y, P.muted, 1.2, { 'stroke-dasharray': '4 4' }), line(rel.x, low.y, past, low.y, P.muted, 1.2, { 'stroke-dasharray': '4 4' }),
        dimension(x, rel.y, x, low.y, words, P, { side: -sign, off: 8, italic: words === 'h' }));
    }
    if (swing) g.push(line(Pv.x, Pv.y, low.x, low.y, P.muted, 1.6, { 'stroke-dasharray': '5 4' }), line(Pv.x, Pv.y, far.x, far.y, P.muted, 1.6, { 'stroke-dasharray': '5 4' }));
    g.push(line(Pv.x, Pv.y, rel.x, rel.y, P.ink2, 2.2, { class: 'of-string' }));
    if (aMark) {
      const a0 = Math.PI / 2, a1 = Math.PI / 2 - sign * rad, end = { x: Pv.x + PD_ARC_R * Math.cos(a1), y: Pv.y + PD_ARC_R * Math.sin(a1) };
      if (swing) g.push(line(Pv.x, Pv.y, Pv.x, Pv.y + PD_ARC_R + 8, P.muted, 1.3, { 'stroke-dasharray': '4 4' }));
      g.push(path(`M ${Pv.x} ${Pv.y + PD_ARC_R} A ${PD_ARC_R} ${PD_ARC_R} 0 0 ${sign > 0 ? 0 : 1} ${r2(end.x)} ${r2(end.y)}`, { stroke: P.ink, 'stroke-width': 1.5 }));
      const mid = a0 - (sign * rad) / 2, words = show('angle') && d.angle !== undefined ? `${fmt(theta, 1, lang)}°` : 'θ';
      g.push(label(Pv.x + (PD_ARC_R + 16) * Math.cos(mid), Pv.y + (PD_ARC_R + 16) * Math.sin(mid), words, { anchor: 'middle', size: 15, italic: words === 'θ', colour: P.ink, halo: P.paper }));
    }
    // the length beside the string, away from the vertical
    const lw = show('length') && d.length !== undefined ? `L = ${fmt(d.length, 3, lang)} m` : 'L', mx = Pv.x + PD_LENGTH * 0.55 * sign * Math.sin(rad), my = Pv.y + PD_LENGTH * 0.55 * Math.cos(rad);
    g.push(label(mx + sign * 12 * Math.cos(rad), my - 12 * Math.sin(rad), lw, { anchor: sign > 0 ? 'start' : 'end', size: 15, italic: lw === 'L', colour: P.ink, halo: P.paper }));
    // the forces on one bob
    if (forces) {
      const Wl = pdWeightOf(theta), out = { x: sign * Math.sin(rad), y: Math.cos(rad) }, downPath = { x: -sign * Math.cos(rad), y: Math.sin(rad) }, c = { t: P.gold, w: P.green, k: P.blue };
      const T = { x: rel.x - out.x * Wl * Math.cos(rad), y: rel.y - out.y * Wl * Math.cos(rad) }, Wt = { x: rel.x, y: rel.y + Wl };
      g.push(force(rel.x, rel.y, T.x, T.y, c.t), label(T.x - sign * 16, T.y + 6, 'T', { anchor: sign > 0 ? 'end' : 'start', size: 15, italic: true, colour: c.t, halo: P.paper }),
        force(rel.x, rel.y, Wt.x, Wt.y, c.w), label(Wt.x, Wt.y + 16, 'mg', { anchor: 'middle', size: 15, italic: true, colour: c.w, halo: P.paper }));
      if (d.forces === 'components') {
        const A = { x: rel.x + out.x * Wl * Math.cos(rad), y: rel.y + out.y * Wl * Math.cos(rad) }, acrossLen = Math.max(Wl * Math.sin(rad), PD_BOB_R + PD_MIN_SHOWN_ACROSS), B = { x: rel.x + downPath.x * acrossLen, y: rel.y + downPath.y * acrossLen };
        g.push(line(Wt.x, Wt.y, A.x, A.y, P.muted, 1.2, { 'stroke-dasharray': '2 3' }), force(rel.x, rel.y, A.x, A.y, c.k), force(rel.x, rel.y, B.x, B.y, c.k),
          label(A.x + sign * 10, A.y + 4, 'mg cos θ', { anchor: sign > 0 ? 'start' : 'end', size: 14, italic: true, colour: c.k, halo: P.paper }),
          label(B.x - sign * 8, B.y + 14, 'mg sin θ', { anchor: sign > 0 ? 'end' : 'start', size: 14, italic: true, colour: c.k, halo: P.paper }));
        if (Wl * Math.sin(rad) >= PD_BOB_R + PD_MIN_SHOWN_ACROSS) g.push(line(Wt.x, Wt.y, B.x, B.y, P.muted, 1.2, { 'stroke-dasharray': '2 3' }));
      }
    }
    if (swing && d.velocity) { const len = Math.min(PD_VELOCITY, PD_LENGTH * Math.sin(rad) - PD_BOB_R - 8); g.push(motion(low.x, low.y, low.x - sign * len, low.y, P.blue), label(low.x - sign * (len + 10), low.y - 2, 'v', { anchor: sign > 0 ? 'end' : 'start', size: 15, italic: true, colour: P.blue, halo: P.paper })); }
    if (swing) g.push(ball(low.x, low.y, PD_BOB_R, P, { dash: '3 3', fill: P.paper }), ball(far.x, far.y, PD_BOB_R, P, { dash: '3 3', fill: P.paper }));
    g.push(ball(rel.x, rel.y, PD_BOB_R, P));
    const mw = !all && d.mass !== undefined ? `m = ${fmt(d.mass, 3, lang)} kg` : 'm', bo = swing ? { x: sign, y: 0 } : { x: sign * Math.cos(rad), y: -Math.sin(rad) };
    g.push(label(rel.x + bo.x * (PD_BOB_R + 8) + (swing ? 0 : sign * 4), rel.y + bo.y * (PD_BOB_R + 8) + (swing ? 0 : -6), mw, { anchor: sign > 0 ? 'start' : 'end', size: 15, italic: mw === 'm', colour: P.ink, halo: P.paper }));
    if (swing && d.letters) {
      const up = { x: -sign * Math.cos(rad), y: -Math.sin(rad) };
      g.push(label(rel.x + sign * Math.cos(rad) * 30, rel.y - Math.sin(rad) * 30 - 8, 'A', { anchor: 'middle', size: 16, colour: P.ink, halo: P.paper }),
        label(low.x, low.y + PD_BOB_R + 18, 'B', { anchor: 'middle', size: 16, colour: P.ink, halo: P.paper }),
        label(far.x + up.x * 30, far.y + up.y * 30 - 8, 'C', { anchor: 'middle', size: 16, colour: P.ink, halo: P.paper }));
    }
    const kids = [];
    if (d.heading) kids.push(label(PD_W / 2, 18, text(d.heading, 60), { anchor: 'middle', size: 15, colour: P.ink }));
    kids.push(node('g', { transform: top ? `translate(0 ${top})` : null }, g));
    return frame(PD_W, PD_H + top, kids, { ...o, kind: 'pendulum' }, o.title || W('pendulum'));
  },
};
export const PENDULUM_KINDS = { pendulum };
