// Oomba Figures: circular motion (1.7.0, the physics pack). Seen from above (an object on a dashed circle, on a string,
// a turntable or a curved road, at up to 8 places), a vertical circle (a ball on a string, a car in a loop, over a
// hill or through a dip) or a conical pendulum, with the velocity and centripetal acceleration as dashed arrows and
// the forces as solid ones; the arrows' lengths and places come from ported/circular.js. With a radius and a speed
// (or a period), and a mass, OF.solve works out the angular speed, the period, the centripetal acceleration and force,
// the tension or normal force at the top and bottom of a vertical circle, and a conical pendulum's radius, speed and
// tension; and which way the velocity and the acceleration point where the object is drawn first.
// hide: "values" (the figure names r, v and m without their numbers), "acceleration" (no acceleration or inward
// force arrows: "draw the acceleration"), "velocity", true (both arrows and the numbers).
import { node, label, subLabel, line, path, frame, palette, fmt, text, hides, r2 } from './svg.js';
import { mechWords, keysCheck, boolCheck, oneOf, numCheck, hatched, motion, force, ball, compass } from './mech.js';
import { CM_TOP, CM_VERTICAL, CM_GROUND_UNIT, CM_CONICAL, cmContact, cmPoints } from './ported/circular.js';

const CM_KEYS = ['kind', 'hide', 'view', 'radius', 'speed', 'period', 'mass', 'g', 'around', 'positions', 'start', 'direction', 'held', 'at', 'angle', 'length', 'object', 'velocity', 'acceleration', 'force', 'forces', 'components', 'radiusMark', 'letters', 'values', 'heading'];
const cmG = d => (d.g === undefined ? 9.8 : d.g);
const TAU = 2 * Math.PI;
/** The speed: given, from the period, or none. */
const speedOf = d => (d.speed !== undefined ? d.speed : d.period !== undefined && d.radius !== undefined ? (TAU * d.radius) / d.period : undefined);

export const circularMotion = {
  check(d) {
    const out = keysCheck(d, CM_KEYS, 'a circular motion figure'), view = d.view || 'top';
    out.push(...oneOf(d, 'view', ['top', 'vertical', 'conical']), ...oneOf(d, 'around', ['nothing', 'string', 'turntable', 'road']), ...oneOf(d, 'direction', ['ccw', 'cw']),
      ...oneOf(d, 'held', ['string', 'loop', 'hill', 'dip']), ...oneOf(d, 'at', ['top', 'bottom', 'side', 'topBottom', 'all']), ...oneOf(d, 'object', ['ball', 'block']),
      ...boolCheck(d, ['velocity', 'acceleration', 'force', 'forces', 'components', 'radiusMark', 'letters', 'values']),
      ...numCheck(d, 'radius', 0.001, 100000, 'the radius'), ...numCheck(d, 'speed', 0, 100000, 'the speed'), ...numCheck(d, 'period', 0.001, 100000, 'the period in s'),
      ...numCheck(d, 'mass', 0.001, 1000000, 'the mass in kg'), ...numCheck(d, 'g', 0.1, 100, 'g in m/s²'), ...numCheck(d, 'start', 0, 359, 'where the object is first, in degrees counterclockwise from the right'),
      ...numCheck(d, 'angle', 15, 60, "the string's angle from the vertical in degrees"), ...numCheck(d, 'length', 0.001, 100000, "the string's length"));
    if (d.positions !== undefined && !(Number.isInteger(d.positions) && d.positions >= 1 && d.positions <= 8)) out.push('"positions" must be a whole number 1 to 8');
    if (d.speed !== undefined && d.period !== undefined) out.push('give the "speed" or the "period", not both');
    if (d.period !== undefined && d.radius === undefined && view !== 'conical') out.push('a "period" needs the "radius" too');
    if (view === 'conical') { for (const k of ['radius', 'speed', 'period']) if (d[k] !== undefined) out.push(`a conical pendulum works its ${k} out from its "length" and "angle": leave "${k}" out`); }
    else for (const k of ['angle', 'length', 'components']) if (d[k] !== undefined) out.push(`"${k}" is for a conical pendulum (view "conical")`);
    if (view !== 'top') for (const k of ['around', 'positions', 'start', 'force']) if (d[k] !== undefined) out.push(`"${k}" is for the top view`);
    if (view !== 'vertical') for (const k of ['held', 'at']) if (d[k] !== undefined) out.push(`"${k}" is for a vertical circle (view "vertical")`);
    if (view === 'vertical' && (d.held === 'hill' || d.held === 'dip') && d.at !== undefined) out.push(`over a ${d.held} the car is drawn at the ${d.held === 'hill' ? 'top' : 'bottom'}: leave "at" out`);
    if (!out.length && view === 'vertical' && d.radius !== undefined && speedOf(d) !== undefined) {
      const v = speedOf(d), gr = cmG(d) * d.radius;
      if (d.held === 'hill' && v * v >= gr) out.push(`at ${fmt(v, 2)} m/s the car leaves the top of the hill (it must be slower than √(gr) = ${fmt(Math.sqrt(gr), 2)} m/s)`);
      if ((d.held || 'string') !== 'hill' && d.held !== 'dip' && cmPoints(d.held, d.at || 'topBottom').includes('top') && v * v < gr) out.push(`at ${fmt(v, 2)} m/s it cannot stay on the circle at the top (it needs at least √(gr) = ${fmt(Math.sqrt(gr), 2)} m/s)`);
    }
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short text');
    return out;
  },
  /** The motion's numbers (SI units when the data is in m, m/s, s and kg) and its directions. */
  solve(d) {
    if (circularMotion.check(d).length) return null;
    const view = d.view || 'top', g = cmG(d), m = d.mass, out = { view, g };
    if (view === 'conical') {
      const th = ((d.angle || 30) * Math.PI) / 180;
      out.angle = d.angle || 30; out.accelerationDir = 'toward the center';
      out.acceleration = g * Math.tan(th);
      if (d.length !== undefined) {
        const L = d.length, r = L * Math.sin(th), v = Math.sqrt(g * r * Math.tan(th));
        Object.assign(out, { length: L, radius: r, speed: v, period: TAU * Math.sqrt((L * Math.cos(th)) / g), omega: v / r, height: L * Math.cos(th) });
        out.frequency = 1 / out.period;
      }
      if (m !== undefined) Object.assign(out, { mass: m, weight: m * g, tension: (m * g) / Math.cos(th), force: m * out.acceleration });
      return out;
    }
    const r = d.radius, v = speedOf(d);
    if (r !== undefined) out.radius = r;
    if (v !== undefined) out.speed = v;
    if (r !== undefined && v !== undefined) {
      Object.assign(out, { omega: v / r, acceleration: (v * v) / r });
      if (v > 0) { out.period = (TAU * r) / v; out.frequency = 1 / out.period; }
      if (m !== undefined) out.force = (m * v * v) / r;
      if (view === 'vertical') {
        out.minSpeedTop = Math.sqrt(g * r);
        if (m !== undefined) {
          const held = d.held || 'string', c = (m * v * v) / r, W = m * g;
          out.weight = W;
          if (held === 'hill') out.contactTop = W - c;
          else if (held === 'dip') out.contactBottom = W + c;
          else Object.assign(out, { contactTop: c - W, contactSide: c, contactBottom: c + W });
        }
      }
    }
    if (view === 'top') {
      const phi = d.start === undefined ? 45 : d.start, ccw = (d.direction || 'ccw') === 'ccw';
      Object.assign(out, { start: phi, velocityAngle: (phi + (ccw ? 90 : 270)) % 360, accelerationAngle: (phi + 180) % 360 });
      out.velocityDir = compass(out.velocityAngle) || 'tangent'; out.accelerationDir = compass(out.accelerationAngle) || 'toward the center';
    } else {
      const first = cmPoints(d.held || 'string', d.at || 'topBottom')[0], ccw = (d.direction || 'ccw') === 'ccw';
      out.at = first; out.accelerationDir = { top: 'down', bottom: 'up', side: 'left' }[first];
      out.velocityDir = { top: ccw ? 'left' : 'right', bottom: ccw ? 'right' : 'left', side: ccw ? 'up' : 'down' }[first];
    }
    out.netForceDir = out.accelerationDir;
    return out;
  },
  draw(d, o) {
    const P = palette(o), view = d.view || 'top', W = mechWords(o.lang), lang = o.lang, top = d.heading ? 30 : 0;
    const showV = d.velocity !== false && !hides(o, 'velocity'), showA = d.acceleration !== false && !hides(o, 'acceleration'), vals = d.values !== false && !hides(o, 'values');
    const C = { v: P.blue, a: P.purple, g: P.green, t: P.gold, f: P.red }, g = [];
    const name = (main, value, unit) => (vals && value !== undefined ? `${main} = ${fmt(value, 2, lang)} ${unit}` : null);
    const tag = (x, y, main, sub, c, anchor = 'start', words = null) => (words ? label(x, y, words, { anchor, size: 14, italic: false, colour: c, halo: P.paper }) : subLabel(x, y, main, sub, { anchor, size: 15, colour: c, halo: P.paper }));
    const vText = name('v', speedOf(d), 'm/s'), rText = name('r', d.radius, 'm'), mText = name('m', d.mass, 'kg');
    const objR = 14, isBlock = d.object === 'block';
    const obj = (x, y, turn = 0) => (isBlock ? node('rect', { x: x - 14, y: y - 14, width: 28, height: 28, rx: 3, fill: P.soft, stroke: P.ink, 'stroke-width': 2, transform: turn ? `rotate(${r2(turn)} ${r2(x)} ${r2(y)})` : null, class: 'of-object' }) : ball(x, y, objR, P));
    const tip = (x, y, ux, uy, len) => [x + ux * len, y + uy * len];
    const labelPast = (x, y, ux, uy, main, sub, c, words) => { const lx = x + ux * 18, ly = y + uy * 18; return tag(lx, ly, main, sub, c, Math.abs(ux) < 0.3 ? 'middle' : ux > 0 ? 'start' : 'end', words); };
    if (view === 'top') {
      const { centre: c0, r: R } = CM_TOP, n = d.positions || 1, phi0 = d.start === undefined ? 45 : d.start, ccw = (d.direction || 'ccw') === 'ccw', around = d.around || 'nothing';
      if (around === 'turntable') g.push(node('circle', { cx: c0.x, cy: c0.y, r: R + 34, fill: P.soft, stroke: P.ink, 'stroke-width': 2.2 }));
      if (around === 'road') g.push(node('circle', { cx: c0.x, cy: c0.y, r: R + 24, fill: P.soft, stroke: P.ink, 'stroke-width': 2.2 }), node('circle', { cx: c0.x, cy: c0.y, r: R - 24, fill: P.paper, stroke: P.ink, 'stroke-width': 2.2 }));
      g.push(node('circle', { cx: c0.x, cy: c0.y, r: R, fill: 'none', stroke: P.muted, 'stroke-width': 1.6, 'stroke-dasharray': '6 5', class: 'of-path' }), node('circle', { cx: c0.x, cy: c0.y, r: 3.5, fill: P.ink }));
      const places = Array.from({ length: n }, (_, i) => (phi0 + (ccw ? 1 : -1) * (360 / n) * i + 360) % 360);
      const objs = [];
      places.forEach((phi, i) => {
        const t = (phi * Math.PI) / 180, ox = c0.x + R * Math.cos(t), oy = c0.y - R * Math.sin(t), out = { x: Math.cos(t), y: -Math.sin(t) };
        const vel = ccw ? { x: -Math.sin(t), y: -Math.cos(t) } : { x: Math.sin(t), y: Math.cos(t) }, labelled = n <= 4 || i === 0;
        if (around === 'string') g.push(line(c0.x, c0.y, ox, oy, P.ink2, 2));
        if (showV) { const [x2, y2] = tip(ox, oy, vel.x, vel.y, CM_TOP.velocity); g.push(motion(ox, oy, x2, y2, C.v)); if (labelled) g.push(labelPast(x2, y2, vel.x, vel.y, 'v', '', C.v, i === 0 ? vText : null)); }
        const both = showA && d.force && !hides(o, true);
        if (showA && o.hide !== true) {
          const sx = both ? -vel.x * 7 : 0, sy = both ? -vel.y * 7 : 0, [x2, y2] = tip(ox + sx, oy + sy, -out.x, -out.y, CM_TOP.inward);
          g.push(motion(ox + sx, oy + sy, x2, y2, C.a)); if (labelled) g.push(tag(x2 - vel.x * 14 - out.x * 6, y2 - vel.y * 14 - out.y * 6, 'a', 'c', C.a, 'middle'));
          if (d.force) { const [fx, fy] = tip(ox - sx, oy - sy, -out.x, -out.y, CM_TOP.inward); g.push(force(ox - sx, oy - sy, fx, fy, C.f)); if (labelled) g.push(tag(fx + vel.x * 14 - out.x * 6, fy + vel.y * 14 - out.y * 6, 'F', 'c', C.f, 'middle')); }
        }
        objs.push(obj(ox, oy, -phi));
        if (d.letters) g.push(label(c0.x + (R + 32) * Math.cos(t), c0.y - (R + 32) * Math.sin(t), String.fromCharCode(65 + i), { anchor: 'middle', size: 16, colour: P.ink, halo: P.paper }));
        if (i === 0 && mText) g.push(label(ox + out.x * 26, oy + out.y * 26 + (Math.abs(out.y) < 0.5 ? 18 : 0), mText, { anchor: out.x < -0.3 ? 'end' : out.x > 0.3 ? 'start' : 'middle', size: 14, colour: P.ink, halo: P.paper }));
      });
      if (d.radiusMark !== false && (d.radius !== undefined || d.radiusMark)) {
        // the radius to the first object, unless a string already shows it: a thin line, its words beside its middle
        const t = (((around === 'string' ? places[0] : places[0] + 180 / Math.max(n, 1) + 120)) * Math.PI) / 180, ex = c0.x + (R - (around === 'string' ? objR + 2 : 0)) * Math.cos(t), ey = c0.y - (R - (around === 'string' ? objR + 2 : 0)) * Math.sin(t);
        if (around !== 'string') g.push(line(c0.x, c0.y, ex, ey, P.ink, 1.4, { 'stroke-dasharray': '2 3' }));
        const sd = ccw ? -1 : 1, mx = (c0.x + ex) / 2 + sd * Math.sin(t) * 22, my = (c0.y + ey) / 2 + sd * Math.cos(t) * 22;
        g.push(label(mx, my, rText || 'r', { anchor: 'middle', size: 15, italic: !rText, colour: P.ink, halo: P.paper, cls: 'of-mark' }));
      }
      g.push(...objs);
    } else if (view === 'vertical') {
      const held = d.held || 'string', pts = cmPoints(held, d.at || 'topBottom'), ccw = (d.direction || 'ccw') === 'ccw';
      const ground = held === 'hill' || held === 'dip', U = ground ? CM_GROUND_UNIT : CM_VERTICAL.unit;
      let c0 = CM_VERTICAL.centre, R = CM_VERTICAL.r;
      if (ground) {
        R = 220; c0 = held === 'hill' ? { x: 320, y: 170 + R } : { x: 320, y: 300 - R };
        const a0 = held === 'hill' ? 35 : 215, a1 = held === 'hill' ? 145 : 325, arcPts = Array.from({ length: 41 }, (_, i) => { const t = ((a0 + ((a1 - a0) * i) / 40) * Math.PI) / 180; return [c0.x + R * Math.cos(t), c0.y - R * Math.sin(t)]; });
        const first = arcPts[0], last = arcPts[40], base = held === 'hill' ? 420 : 420;
        g.push(path(`M ${r2(first[0])} ${base} L ${arcPts.map(p => `${r2(p[0])} ${r2(p[1])}`).join(' L ')} L ${r2(last[0])} ${base} Z`, { fill: P.soft, stroke: 'none' }),
          path(`M ${arcPts.map(p => `${r2(p[0])} ${r2(p[1])}`).join(' L ')}`, { stroke: P.ink, 'stroke-width': 2.6, class: 'of-ground' }));
      } else {
        g.push(node('circle', { cx: c0.x, cy: c0.y, r: R, fill: 'none', stroke: held === 'loop' ? P.ink : P.muted, 'stroke-width': held === 'loop' ? 3 : 1.6, 'stroke-dasharray': held === 'loop' ? null : '6 5', class: 'of-path' }), node('circle', { cx: c0.x, cy: c0.y, r: 3.5, fill: P.ink }));
      }
      const objs = [];
      pts.forEach((p, i) => {
        const ang = { top: 90, side: 0, bottom: 270 }[p], t = (ang * Math.PI) / 180, rr = held === 'loop' ? R - objR - 2 : held === 'dip' ? R - objR : held === 'hill' ? R + objR : R;
        const ox = c0.x + rr * Math.cos(t), oy = c0.y - rr * Math.sin(t), inward = held === 'hill' ? { x: 0, y: 1 } : held === 'dip' ? { x: 0, y: -1 } : { x: -Math.cos(t), y: Math.sin(t) };
        const vel = ccw ? { x: -Math.sin(t), y: -Math.cos(t) } : { x: Math.sin(t), y: Math.cos(t) };
        if (held === 'string') g.push(line(c0.x, c0.y, ox, oy, P.ink2, 2));
        if (d.forces !== false) {
          const contact = U * cmContact(held, p), cdir = held === 'hill' || held === 'dip' ? { x: 0, y: -1 } : inward, same = Math.abs(cdir.x) < 1e-9 && cdir.y > 0;
          const gx = same ? ox - 8 : ox, cx = same ? ox + 8 : ox;
          g.push(force(gx, oy, gx, oy + U, C.g), subLabel(gx + (same ? -8 : 10), oy + U + 4, 'F', 'g', { anchor: same ? 'end' : 'start', size: 15, colour: C.g, halo: P.paper }));
          const [tx, ty] = tip(cx, oy, cdir.x, cdir.y, contact);
          g.push(force(cx, oy, tx, ty, C.t));
          const words = held === 'string' ? ['T', ''] : ['F', 'N'], lx = tx + (Math.abs(cdir.x) > 0.5 ? cdir.x * 12 : same ? 10 : 10), ly = ty + (Math.abs(cdir.y) > 0.5 ? cdir.y * 10 : -14);
          g.push(subLabel(lx, ly, words[0], words[1], { anchor: Math.abs(cdir.x) > 0.5 && cdir.x < 0 ? 'end' : 'start', size: 15, colour: C.t, halo: P.paper }));
        }
        if (showV) { const [x2, y2] = tip(ox, oy, vel.x, vel.y, CM_VERTICAL.velocity); g.push(motion(ox, oy, x2, y2, C.v), labelPast(x2, y2, vel.x, vel.y, 'v', '', C.v, i === 0 ? vText : null)); }
        if (showA && o.hide !== true) {
          // beside the object, toward the middle (the forces take the line through it)
          const k = d.forces === false ? 0 : 44, bx = ox - vel.x * k, by = oy - vel.y * k, [x2, y2] = tip(bx, by, inward.x, inward.y, 50);
          g.push(motion(bx, by, x2, y2, C.a), tag(x2 + (Math.abs(inward.y) > 0.5 ? 12 : 0), y2 + (Math.abs(inward.x) > 0.5 ? 16 : 0), 'a', 'c', C.a, 'start'));
        }
        objs.push(obj(ox, oy));
        if (d.letters) g.push(label(ox + (p === 'side' ? 34 : -30), oy + (p === 'side' ? -22 : p === 'top' ? -24 : 26), String.fromCharCode(65 + i), { anchor: 'middle', size: 16, colour: P.ink, halo: P.paper }));
      });
      if (!ground && (d.radius !== undefined || d.radiusMark)) {
        const t = (200 * Math.PI) / 180, ex = c0.x + R * Math.cos(t), ey = c0.y - R * Math.sin(t);
        g.push(line(c0.x, c0.y, ex, ey, P.ink, 1.4, { 'stroke-dasharray': '2 3' }), label((c0.x + ex) / 2 - 4, (c0.y + ey) / 2 + 16, rText || 'r', { anchor: 'middle', size: 15, italic: !rText, colour: P.ink, halo: P.paper, cls: 'of-mark' }));
      }
      if (ground && d.radius !== undefined) g.push(label(40, 30, rText || 'r', { size: 14, colour: P.ink }));
      if (mText) g.push(label(600, 30, mText, { anchor: 'end', size: 14, colour: P.ink }));
      g.push(...objs);
    } else {
      const th = d.angle || 30, t = (th * Math.PI) / 180, pv = { x: 320, y: CM_CONICAL.pivot.y }, L = CM_CONICAL.length, bob = { x: pv.x + L * Math.sin(t), y: pv.y + L * Math.cos(t) };
      const rx = L * Math.sin(t), ry = rx * CM_CONICAL.squash;
      g.push(hatched(pv.x - 70, pv.x + 70, pv.y, P), node('ellipse', { cx: pv.x, cy: bob.y, rx, ry, fill: 'none', stroke: P.muted, 'stroke-width': 1.6, 'stroke-dasharray': '6 5', class: 'of-path' }),
        line(pv.x, pv.y, pv.x, bob.y, P.muted, 1.4, { 'stroke-dasharray': '4 4' }), node('circle', { cx: pv.x, cy: bob.y, r: 3, fill: P.ink }), line(pv.x, pv.y, bob.x, bob.y, P.ink2, 2.2));
      // the angle and the string's length
      const ar = 46;
      g.push(path(`M ${pv.x} ${pv.y + ar} A ${ar} ${ar} 0 0 0 ${r2(pv.x + ar * Math.sin(t))} ${r2(pv.y + ar * Math.cos(t))}`, { stroke: P.ink, 'stroke-width': 1.5 }),
        label(pv.x + (ar + 14) * Math.sin(t / 2), pv.y + (ar + 14) * Math.cos(t / 2), vals ? `${fmt(th, 1, lang)}°` : 'θ', { anchor: 'middle', size: 14, italic: !vals, colour: P.ink, halo: P.paper }),
        label(pv.x + L * 0.5 * Math.sin(t) + 14 * Math.cos(t), pv.y + L * 0.5 * Math.cos(t) - 14 * Math.sin(t) + 4, name('L', d.length, 'm') || 'L', { size: 15, italic: !(vals && d.length !== undefined), colour: P.ink, halo: P.paper }));
      if (d.radiusMark) g.push(label((pv.x + bob.x) / 2, bob.y + ry + 18, 'r', { anchor: 'middle', size: 15, italic: true, colour: P.ink, halo: P.paper }), line(pv.x, bob.y, bob.x - objR, bob.y, P.ink, 1.2, { 'stroke-dasharray': '2 3' }));
      if (d.forces !== false) {
        const Wl = CM_CONICAL.gravity, Tl = Wl / Math.cos(t), ux = -Math.sin(t), uy = -Math.cos(t);
        g.push(force(bob.x, bob.y, bob.x, bob.y + Wl, C.g), subLabel(bob.x + 10, bob.y + Wl, 'F', 'g', { size: 15, colour: C.g, halo: P.paper }),
          force(bob.x, bob.y, bob.x + ux * Tl, bob.y + uy * Tl, C.t), label(bob.x + ux * Tl - 8, bob.y + uy * Tl - 4, 'T', { anchor: 'end', size: 15, italic: true, colour: C.t, halo: P.paper }));
        if (d.components) {
          const tx = bob.x + ux * Tl, ty = bob.y + uy * Tl;
          g.push(line(tx, ty, bob.x, ty, P.muted, 1.2, { 'stroke-dasharray': '2 3' }), line(tx, ty, tx, bob.y, P.muted, 1.2, { 'stroke-dasharray': '2 3' }),
            force(bob.x, bob.y, tx, bob.y, C.t), force(bob.x, bob.y, bob.x, ty, C.t),
            subLabel(tx - 4, bob.y + 16, 'T', 'x', { anchor: 'end', size: 14, colour: C.t, halo: P.paper }), subLabel(bob.x + 10, ty + 10, 'T', 'y', { size: 14, colour: C.t, halo: P.paper }));
        }
      }
      if (showA && o.hide !== true) g.push(motion(bob.x - 4, bob.y + 34, bob.x - 54, bob.y + 34, C.a), tag(bob.x - 60, bob.y + 34, 'a', 'c', C.a, 'end'));
      if (showV) g.push(node('circle', { cx: bob.x + 34, cy: bob.y - 20, r: 9, fill: P.paper, stroke: C.v, 'stroke-width': 2 }), node('circle', { cx: bob.x + 34, cy: bob.y - 20, r: 3, fill: C.v }), label(bob.x + 48, bob.y - 20, 'v', { size: 15, italic: true, colour: C.v, halo: P.paper }));
      g.push(obj(bob.x, bob.y));
      if (mText) g.push(label(600, 30, mText, { anchor: 'end', size: 14, colour: P.ink }));
    }
    const kids = [];
    if (d.heading) kids.push(label(320, 18, text(d.heading, 60), { anchor: 'middle', size: 15, colour: P.ink }));
    kids.push(node('g', { transform: top ? `translate(0 ${top})` : null }, g));
    return frame(640, 420 + top, kids, { ...o, kind: 'circularMotion' }, o.title || W('circularMotion'));
  },
};
export const CIRCULAR_KINDS = { circularMotion };
