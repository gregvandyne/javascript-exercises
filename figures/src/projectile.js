// Oomba Figures: projectile motion (the physics pack, 1.1.0). A ball launched at a speed and an angle from level ground
// or from a cliff, its path the real parabola for those numbers and g (ported/projectile.js), drawn to one scale across
// and up, so the range and the greatest height are where the physics puts them. The ball again at equal time steps,
// the launch velocity and its components, g, the angle, and dimension marks for the range, the greatest height and
// the cliff. The arrows show directions (their lengths are a symbol, the components in proportion to the velocity).
import { node, label, line, path, arrow, frame, palette, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { pjFlight, pjPositions } from './ported/projectile.js';

const PJ_KEYS = ['kind', 'hide', 'speed', 'angle', 'height', 'g', 'positions', 'letters', 'path', 'velocity', 'components', 'gravity', 'angleMark', 'marks', 'unit', 'heading'];
const PJ_MARKS = ['range', 'height', 'cliff'];
const pjG = d => (d.g === undefined ? 9.8 : d.g);
/**
 * { speed (m/s), angle (degrees above the horizontal: 5 to 85 from the ground, 0 to 85 from a cliff), height?: the
 * launch height above the ground (a cliff, m), g?: 9.8, positions?: 0 to 8 (the ball at equal time steps), letters?:
 * true (A at the launch, then B, C...), path?: true, velocity?: true (the launch velocity), components?: true, gravity?:
 * true, angleMark?: true, marks?: ["range", "height", "cliff"] (dimension lines with their values) }. hide: true (no
 * path or balls along it, the marks name R, H, h without values: "sketch the path"), "path", or a mark's name (its
 * letter instead of its value).
 */
export const projectile = {
  check(d) {
    const out = [];
    for (const k of Object.keys(d)) if (!PJ_KEYS.includes(k)) out.push(`"${k}" is not used by a projectile`);
    if (!isNum(d.speed, 0.1, 1000)) out.push('"speed" must be the launch speed in m/s, above 0 and at most 1000');
    const h = d.height === undefined ? 0 : d.height;
    if (!isNum(h, 0, 10000)) out.push('"height" must be the launch height above the ground in m (0 for level ground)');
    if (!isNum(d.angle, h > 0 ? 0 : 5, 85)) out.push(h > 0 ? '"angle" must be 0 to 85 degrees above the horizontal' : '"angle" must be 5 to 85 degrees above the horizontal (from level ground; a flatter launch never leaves it: give a "height" for a cliff)');
    if (!isNum(pjG(d), 0.1, 100)) out.push('"g" must be the gravitational field strength in m/s², 0.1 to 100');
    if (d.positions !== undefined && !(Number.isInteger(d.positions) && d.positions >= 0 && d.positions <= 8)) out.push('"positions" must be a whole number 0 to 8');
    for (const k of ['letters', 'path', 'velocity', 'components', 'gravity', 'angleMark']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
    if (d.marks !== undefined && (!Array.isArray(d.marks) || d.marks.some(m => !PJ_MARKS.includes(m)))) out.push(`"marks" lists any of ${PJ_MARKS.join(', ')}`);
    if (!out.length && (d.marks || []).includes('cliff') && !(h > 0)) out.push('a "cliff" mark needs a "height"');
    if (!out.length && (d.marks || []).includes('height') && d.angle === 0) out.push('launched flat, its greatest height is the cliff: mark "cliff", not "height"');
    if (!out.length && d.letters && !d.positions) out.push('"letters" name the balls at equal time steps: give "positions"');
    if (!out.length) {
      const f = pjFlight(d.speed, d.angle, h, pjG(d)), ratio = Math.max(f.range, 1e-9) / Math.max(f.maxHeight, 1e-9);
      if (ratio > 40 || ratio < 1 / 12) out.push(`the path is ${fmt(f.range, 1)} m long and ${fmt(f.maxHeight, 1)} m high: too ${ratio > 40 ? 'flat' : 'tall'} to draw to scale (change the angle or the height)`);
    }
    return out;
  },
  /** The flight from the numbers: the components of the launch velocity, the time of flight, the range (from the launch
   *  point to the landing, along the ground), the greatest height above the ground (and above the launch), when it is
   *  highest, the landing speed and angle, and the balls' times and places. */
  solve(d) {
    if (projectile.check(d).length) return null;
    const h = d.height || 0, f = pjFlight(d.speed, d.angle, h, pjG(d));
    return { vx: f.vx, vy: f.vy, time: f.time, range: f.range, maxHeight: f.maxHeight, rise: f.rise, peakTime: f.peakT, landingSpeed: f.landingSpeed, landingAngle: f.landingAngle, g: pjG(d), height: h,
      positions: pjPositions(f, d.positions || 0).map(p => ({ t: p.t, x: p.x, y: p.y })) };
  },
  draw(d, o) {
    const P = palette(o), lang = o.lang, h = d.height || 0, f = pjFlight(d.speed, d.angle, h, pjG(d)), unit = text(d.unit, 6) || 'm';
    const marks = d.marks || [], blank = o.hide === true, noPath = blank || hides(o, 'path') || d.path === false;
    const cliffW = h > 0 ? 70 : 0, left = 40 + cliffW + (marks.includes('cliff') ? 70 : 0) + (d.components ? 40 : 0), right = 50 + (marks.includes('height') ? 0 : 0), top = 60 + (d.heading ? 24 : 0), bottom = 70;
    const k = Math.min(520 / Math.max(f.range, 1e-9), 300 / Math.max(f.maxHeight, 1e-9));
    const Wd = left + f.range * k + right, Gy = top + f.maxHeight * k, X = x => left + x * k, Y = y => Gy - y * k, kids = [];
    if (d.heading) kids.push(label(Wd / 2, 22, text(d.heading, 60), { anchor: 'middle', size: 15, colour: P.ink }));
    // the ground (and the cliff)
    if (h > 0) {
      kids.push(node('rect', { x: X(0) - cliffW, y: Y(h), width: cliffW, height: h * k, fill: P.soft, stroke: P.ink, 'stroke-width': 2, class: 'of-cliff' }));
      for (let yy = Y(h) + 10; yy < Gy - 2; yy += 14) kids.push(line(X(0) - cliffW + 4, yy, X(0) - cliffW + 14, yy - 8, P.muted, 1));
    }
    kids.push(line(X(0) - cliffW - 30, Gy, X(f.range) + 40, Gy, P.ink, 2.5));
    const R = 7, launch = { x: X(0), y: Y(h) };
    // the path: the exact parabola as one quadratic curve
    if (!noPath) {
      kids.push(path(`M ${r2(X(0))} ${r2(Y(h))} Q ${r2(X(f.control.x))} ${r2(Y(f.control.y))} ${r2(X(f.range))} ${r2(Y(0))}`, { stroke: P.green, 'stroke-width': 2.6, 'stroke-dasharray': '8 6', class: 'of-path' }));
      pjPositions(f, d.positions || 0).forEach((p, i) => {
        kids.push(node('circle', { cx: X(p.x), cy: Y(p.y), r: R, fill: P.paper, stroke: P.ink, 'stroke-width': 2, class: 'of-ball' }));
        if (d.letters) kids.push(label(X(p.x) + 9, Y(p.y) - 14, String.fromCharCode(66 + i), { size: 13, colour: P.ink, halo: P.paper }));
      });
    }
    kids.push(node('circle', { cx: launch.x, cy: launch.y - (h > 0 ? 0 : 0), r: R + 1, fill: P.red, class: 'of-ball' }));
    if (d.letters && !noPath && d.positions) kids.push(label(launch.x - 10, launch.y - 16, 'A', { anchor: 'end', size: 13, colour: P.ink, halo: P.paper }));
    // the launch velocity, its components (in proportion) and the angle
    const a = (d.angle * Math.PI) / 180, VL = 70, tip = { x: launch.x + VL * Math.cos(a), y: launch.y - VL * Math.sin(a) };
    if (d.velocity !== false) {
      kids.push(node('g', { class: 'of-velocity' }, arrow(launch.x, launch.y, tip.x, tip.y, { colour: P.blue, width: 3 })), label(tip.x + 6, tip.y - 10, 'v₀', { size: 14, italic: true, colour: P.blue, halo: P.paper }));
      if (d.components && d.angle > 0) {
        kids.push(arrow(launch.x, launch.y, tip.x, launch.y, { colour: P.purple, width: 2.2, head: 9 }), arrow(launch.x, launch.y, launch.x, tip.y, { colour: P.purple, width: 2.2, head: 9 }),
          line(tip.x, tip.y, tip.x, launch.y, P.muted, 1.2, { 'stroke-dasharray': '3 4' }), line(tip.x, tip.y, launch.x, tip.y, P.muted, 1.2, { 'stroke-dasharray': '3 4' }),
          label(tip.x + 4, launch.y + 14, 'v₀ₓ', { size: 13, italic: true, colour: P.purple, halo: P.paper }), label(launch.x - 8, (launch.y + tip.y) / 2, 'v₀ᵧ', { anchor: 'end', size: 13, italic: true, colour: P.purple, halo: P.paper }));
      }
      if (d.angleMark !== false && d.angle > 0) {
        const ar = 30;
        if (h > 0) kids.push(line(launch.x, launch.y, launch.x + ar + 14, launch.y, P.muted, 1.4, { 'stroke-dasharray': '4 4' }));
        kids.push(path(`M ${r2(launch.x + ar)} ${r2(launch.y)} A ${ar} ${ar} 0 0 0 ${r2(launch.x + ar * Math.cos(a))} ${r2(launch.y - ar * Math.sin(a))}`, { stroke: P.ink, 'stroke-width': 1.6 }),
          label(launch.x + (ar + 22) * Math.cos(a / 2) + 10, launch.y - (ar + 12) * Math.sin(a / 2), `${fmt(d.angle, 1, lang)}°`, { size: 13, colour: P.ink, halo: P.paper }));
      }
    }
    if (d.gravity) {
      const p = f.at(f.time * 0.6), gx = X(p.x) + 30, gy = Y(p.y) - 70;
      kids.push(arrow(gx, gy, gx, gy + 46, { colour: P.red, width: 2.6, head: 10 }), label(gx + 8, gy + 24, 'g', { size: 14, italic: true, colour: P.red, halo: P.paper }));
    }
    // the dimension marks
    const dim = (x1, y1, x2, y2, words, side) => {
      const out = [arrow((x1 + x2) / 2, (y1 + y2) / 2, x1, y1, { colour: P.ink, width: 1.5, head: 8 }), arrow((x1 + x2) / 2, (y1 + y2) / 2, x2, y2, { colour: P.ink, width: 1.5, head: 8 })];
      const horiz = Math.abs(y1 - y2) < 1;
      out.push(label(horiz ? (x1 + x2) / 2 : x1 + side * 8, horiz ? y1 + 18 : (y1 + y2) / 2, words, { anchor: horiz ? 'middle' : side > 0 ? 'start' : 'end', size: 13, colour: P.ink, halo: P.paper, cls: 'of-mark' }));
      return node('g', { class: 'of-dim' }, out);
    };
    const value = (name, letter, v) => (blank || hides(o, name) ? letter : `${letter} = ${fmt(v, 1, lang)} ${unit}`);
    if (marks.includes('range')) { const y = Gy + 26; kids.push(line(X(0), Gy + 4, X(0), y + 6, P.muted, 1), line(X(f.range), Gy + 4, X(f.range), y + 6, P.muted, 1), dim(X(0), y, X(f.range), y, value('range', 'R', f.range), 1)); }
    if (marks.includes('height') && f.rise > 0) kids.push(line(X(f.peak.x), Y(f.peak.y), X(f.peak.x), Gy, P.muted, 1, { 'stroke-dasharray': '3 4' }), dim(X(f.peak.x), Gy, X(f.peak.x), Y(f.peak.y) + R + 2, value('height', 'H', f.maxHeight), 1));
    if (marks.includes('cliff')) { const x = X(0) - cliffW - 22; kids.push(line(X(0) - cliffW - 4, Y(h), x - 6, Y(h), P.muted, 1), dim(x, Gy, x, Y(h), value('cliff', 'h', h), -1)); }
    return frame(Wd + (marks.includes('height') ? 60 : 0), Gy + bottom, kids, { ...o, kind: 'projectile' }, o.title || figWords(lang)('projectile'));
  },
};
export const PROJECTILE_KINDS = { projectile };
