// Oomba Figures: torque (1.7.0, the physics pack). A beam on a pivot, on two supports (A and B) or fixed to a wall
// (with or without a cable), with up to 6 loads (hanging under it, resting on it, or forces down or up), its own
// weight at its middle, and dimension lines from the pivot (support A, or the wall) to each load. Places are along
// the beam from its left end, in the beam's unit; values are weights in N or masses in kg or g. OF.solve gives the
// torques (clockwise positive), the net torque and which way the beam turns, the pivot's force, the value or the place
// that would balance each load, the forces at two supports, and the cable's tension and the wall's force
// (ported/moments.js). hide: "distances" (the loads' distances are "?"), "values" (the loads' values are "?"),
// "forces" (the support forces' values are "?"), true (distances and values).
import { node, label, subLabel, line, path, frame, palette, fmt, isNum, text, hides } from './svg.js';
import { mechWords, keysCheck, boolCheck, oneOf, lbl, hatched, wallAt, block, force, dimension } from './mech.js';
import { tqOnBeam, tqWeight, tqForces, tqPivot, tqTwo, tqWall, tqBalancingValue, tqBalancingArm } from './ported/moments.js';

const TQ_KEYS = ['kind', 'hide', 'support', 'length', 'unit', 'pivot', 'supportA', 'supportB', 'loads', 'valueUnit', 'g', 'beam', 'distances', 'supportForces', 'cable', 'cableAt', 'cableAngle', 'values', 'lengthMark', 'heading'];
const TQ_LOAD_KEYS = ['at', 'value', 'kind', 'label', 'distanceLabel'];
const TQ_LOAD_KINDS = ['hanging', 'resting', 'down', 'up'];
/** The beam as ported/moments.js takes it, with the defaults filled in. */
function beamOf(d) {
  const length = d.length === undefined ? 1 : d.length;
  return { support: d.support || 'pivot', length, unit: d.valueUnit || 'N', g: d.g === undefined ? 9.8 : d.g, pivot: d.pivot === undefined ? length / 2 : d.pivot,
    supportA: d.supportA === undefined ? 0 : d.supportA, supportB: d.supportB === undefined ? length : d.supportB, beam: d.beam || 0, cable: d.cable !== false,
    cableAt: d.cableAt === undefined ? length : d.cableAt, cableAngle: d.cableAngle === undefined ? 30 : d.cableAngle,
    loads: (d.loads || []).map(l => ({ at: l.at, value: l.value, kind: l.kind || 'hanging' })) };
}
const tidy = v => Math.round(v * 1e9) / 1e9;

export const torque = {
  check(d) {
    const out = keysCheck(d, TQ_KEYS, 'a torque figure');
    out.push(...oneOf(d, 'support', ['pivot', 'two', 'wall']), ...oneOf(d, 'unit', ['m', 'cm']), ...oneOf(d, 'valueUnit', ['N', 'kg', 'g']), ...boolCheck(d, ['distances', 'supportForces', 'cable', 'values', 'lengthMark']));
    if (d.length !== undefined && !isNum(d.length, 0.1, 100)) out.push('"length" must be the beam\'s length, 0.1 to 100');
    const length = d.length === undefined ? 1 : d.length;
    for (const k of ['pivot', 'supportA', 'supportB', 'cableAt']) if (d[k] !== undefined && !isNum(d[k], 0, length)) out.push(`"${k}" must be a place along the beam, 0 to ${fmt(length, 2)} from its left end`);
    if (d.g !== undefined && !isNum(d.g, 0.1, 100)) out.push('"g" must be g in N/kg');
    if (d.beam !== undefined && !isNum(d.beam, 0, 99999)) out.push('"beam" must be the beam\'s own weight (or mass), 0 for a light beam');
    if (d.cableAngle !== undefined && !isNum(d.cableAngle, 15, 75)) out.push('"cableAngle" must be 15 to 75 degrees between the cable and the beam');
    if (!Array.isArray(d.loads) || d.loads.length > 6) out.push('"loads" lists up to 6 loads: { at, value, kind: "hanging" | "resting" | "down" | "up" }');
    else d.loads.forEach((l, i) => {
      if (!l || typeof l !== 'object') { out.push(`load ${i + 1} must be { at, value }`); return; }
      for (const k of Object.keys(l)) if (!TQ_LOAD_KEYS.includes(k)) out.push(`load ${i + 1}: "${k}" is not used`);
      if (!isNum(l.at, 0, length)) out.push(`load ${i + 1}: "at" must be its place from the beam's left end, 0 to ${fmt(length, 2)}`);
      if (!isNum(l.value, 0, 99999)) out.push(`load ${i + 1}: "value" must be its weight (or mass), 0 or more`);
      if (l.kind !== undefined && !TQ_LOAD_KINDS.includes(l.kind)) out.push(`load ${i + 1}: "kind" must be ${TQ_LOAD_KINDS.join(', ')}`);
    });
    if (out.length) return out;
    const b = beamOf(d);
    if (b.support === 'two' && Math.abs(b.supportA - b.supportB) < 1e-9) out.push('the two supports are at the same place: move one');
    if (b.support !== 'pivot') for (const k of ['pivot']) if (d[k] !== undefined) out.push(`"${k}" is for a beam on a pivot`);
    if (b.support !== 'two') for (const k of ['supportA', 'supportB']) if (d[k] !== undefined) out.push(`"${k}" is for a beam on two supports`);
    if (b.support !== 'wall') for (const k of ['cable', 'cableAt', 'cableAngle']) if (d[k] !== undefined) out.push(`"${k}" is for a beam fixed to a wall`);
    if (b.support === 'wall' && b.cable) { const w = tqWall(b); if (w.cableProblem === 'atWall') out.push('the cable meets the beam at the wall, so it cannot hold it up: move it along the beam'); else if (w.cableProblem === 'push') out.push('the cable would have to push (its tension comes out negative): a cable can only pull'); }
    const placed = new Map();
    for (const l of d.loads) { const k = `${l.at}:${['hanging', 'up'].includes(l.kind || 'hanging') ? 'below' : 'above'}`; if (placed.has(k)) out.push(`two loads at ${fmt(l.at, 3)} on the same side of the beam would be drawn on top of each other`); placed.set(k, 1); }
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short text');
    return out;
  },
  /** The weights (N), each load's torque about the pivot (clockwise positive) and its distance, the totals and the net,
   *  which way the beam turns, the pivot's force up; the value and the distance from the pivot that would balance each
   *  load (numbered from 1); the forces at two supports; the cable's tension and the wall's force. */
  solve(d) {
    if (torque.check(d).length) return null;
    const b = beamOf(d), forces = tqForces(b), out = { support: b.support, weights: {}, total: tidy(forces.reduce((t, f) => t + f.down, 0)) };
    b.loads.forEach((l, i) => { out.weights[i + 1] = tidy(tqWeight(l.value, b.unit, b.g)); });
    if (b.support === 'pivot') {
      const s = tqPivot(b);
      Object.assign(out, { clockwise: tidy(s.clockwise), counterclockwise: tidy(s.counterclockwise), net: tidy(s.net), turns: s.balanced ? 'balanced' : s.net > 0 ? 'clockwise' : 'counterclockwise', pivotForce: tidy(s.pivotForce), torques: {}, distances: {}, balanceValue: {}, balanceDistance: {} });
      s.torques.forEach(t => { if (t.force.of === 'beam') return; out.torques[t.force.of + 1] = tidy(t.torque); out.distances[t.force.of + 1] = tidy(Math.abs(t.arm)); });
      b.loads.forEach((l, i) => { const v = tqBalancingValue(b, i), a = tqBalancingArm(b, i); if (v !== null) out.balanceValue[i + 1] = tidy(v); if (a !== null) out.balanceDistance[i + 1] = tidy(a); });
    } else if (b.support === 'two') {
      const t = tqTwo(b);
      Object.assign(out, { forceA: tidy(t.forceA), forceB: tidy(t.forceB), tips: t.negative ? (t.negative === 'A' ? 'B' : 'A') : '' });
    } else {
      const w = tqWall(b);
      Object.assign(out, { moment: tidy(w.moment), wallUp: tidy(w.up) });
      if (b.cable) Object.assign(out, { tension: tidy(w.tension), wallAlong: tidy(w.along) });
    }
    return out;
  },
  draw(d, o) {
    const P = palette(o), lang = o.lang, W = mechWords(lang), b = beamOf(d), unit = d.unit || 'm', vals = d.values !== false;
    const hideDist = o.hide === true || hides(o, 'distances'), hideVal = o.hide === true || hides(o, 'values'), hideF = hides(o, 'forces');
    const x0 = 70, x1 = 570, k = (x1 - x0) / b.length, X = v => x0 + tqOnBeam(v, b.length) * k, th = 12;
    const ref = b.support === 'pivot' ? b.pivot : b.support === 'two' ? b.supportA : 0;
    const above = b.loads.some(l => l.kind === 'resting' || l.kind === 'down'), rows = d.distances === false ? 0 : b.loads.filter(l => Math.abs(l.at - ref) > 1e-9).length;
    const head = d.heading ? 30 : 0, cableRise = b.support === 'wall' && b.cable ? Math.min((X(b.cableAt) - x0) * Math.tan((b.cableAngle * Math.PI) / 180), 300) : 0;
    const beamTop = head + Math.max(24 + rows * 26 + (above ? 70 : 10), cableRise + 24), under = beamTop + th;
    const g = [], valueText = (l, i) => (hideVal ? '?' : lbl(d.loads[i].label, vals ? `${fmt(l.value, 3, lang)} ${b.unit}` : ''));
    if (d.heading) g.push(label(320, 18, text(d.heading, 60), { anchor: 'middle', size: 15, colour: P.ink }));
    // what holds it up
    const tri = (x, name) => [node('polygon', { points: `${x},${under} ${x - 18},${under + 34} ${x + 18},${under + 34}`, fill: P.soft, stroke: P.ink, 'stroke-width': 2, 'stroke-linejoin': 'round', class: 'of-support' }), hatched(x - 28, x + 28, under + 34, P, true), name ? label(x, under + 58, name, { anchor: 'middle', size: 15, colour: P.ink }) : null];
    if (b.support === 'pivot') g.push(...tri(X(b.pivot)));
    if (b.support === 'two') g.push(...tri(X(b.supportA), 'A'), ...tri(X(b.supportB), 'B'));
    if (b.support === 'wall') {
      g.push(wallAt(x0, head + 20, under + 90, P, -1));
      if (b.cable) {
        const cx = X(b.cableAt), rise = cableRise, wy = beamTop - rise, ang = (Math.atan2(rise, cx - x0) * 180) / Math.PI;
        g.push(line(cx, beamTop, x0, wy, P.ink2, 2, { class: 'of-cable' }), node('circle', { cx, cy: beamTop, r: 3, fill: P.ink }));
        const ar = 34, t = (ang * Math.PI) / 180;
        g.push(path(`M ${cx - ar} ${beamTop} A ${ar} ${ar} 0 0 1 ${cx - ar * Math.cos(t)} ${beamTop - ar * Math.sin(t)}`, { stroke: P.ink, 'stroke-width': 1.4 }),
          label(cx - (ar + 16) * Math.cos(t / 2), beamTop - (ar + 8) * Math.sin(t / 2) - 4, vals ? `${fmt(b.cableAngle, 1, lang)}°` : 'θ', { anchor: 'end', size: 14, italic: !vals, colour: P.ink, halo: P.paper }));
        if (d.supportForces) {
          const ux = (x0 - cx) / Math.hypot(x0 - cx, wy - beamTop), uy = (wy - beamTop) / Math.hypot(x0 - cx, wy - beamTop);
          g.push(force(cx, beamTop, cx + ux * 70, beamTop + uy * 70, P.red), label(cx + ux * 70 + 6, beamTop + uy * 70 - 10, hideF ? 'T = ?' : 'T', { size: 15, italic: true, colour: P.red, halo: P.paper }));
        }
      }
    }
    g.push(node('rect', { x: x0, y: beamTop, width: x1 - x0, height: th, rx: 2, fill: P.paper, stroke: P.ink, 'stroke-width': 2, class: 'of-beam' }));
    // the loads
    b.loads.forEach((l, i) => {
      const x = X(l.at), words = valueText(l, i);
      if (l.kind === 'hanging') g.push(line(x, under, x, under + 26, P.ink2, 1.8), block(x, under + 26 + 40, 48, 40, words, P, { size: 13 }));
      else if (l.kind === 'resting') g.push(block(x, beamTop, 48, 40, words, P, { size: 13 }));
      else if (l.kind === 'down') g.push(force(x, beamTop - 60, x, beamTop - 1, P.ink), label(x, beamTop - 70, words, { anchor: 'middle', size: 14, colour: P.ink, halo: P.paper }));
      else g.push(force(x, under + 60, x, under + 1, P.ink), label(x, under + 74, words, { anchor: 'middle', size: 14, colour: P.ink, halo: P.paper }));
    });
    if (b.beam > 0) {
      const x = X(b.length / 2);
      g.push(node('g', { class: 'of-beamweight' }, force(x, beamTop + th / 2, x, under + 54, P.green)), label(x + 8, under + 48, hideVal ? 'W = ?' : vals ? `W = ${fmt(b.beam, 3, lang)} ${b.unit}` : 'W', { size: 14, colour: P.green, halo: P.paper }));
    }
    if (d.supportForces && b.support !== 'wall') {
      const s = torque.solve(d) || {}, at = b.support === 'pivot' ? [[b.pivot, 'F', '', s.pivotForce]] : [[b.supportA, 'F', 'A', s.forceA], [b.supportB, 'F', 'B', s.forceB]];
      for (const [p, m, sub, v] of at) {
        const right = X(p) < 470, x = X(p) + (right ? 24 : -24);
        g.push(force(x, under + 50, x, under + 2, P.red), subLabel(x + (right ? 6 : -6), under + 40, m, sub, { anchor: right ? 'start' : 'end', size: 15, colour: P.red, halo: P.paper, after: hideF || !vals || !Number.isFinite(v) ? '' : ` = ${fmt(v, 2, lang)} N` }));
      }
    }
    // the distances, one row each, from the pivot (support A, or the wall)
    if (d.distances !== false) {
      let row = 0;
      const rx = X(ref), base = beamTop - (above ? 70 : 10);
      b.loads.map((l, i) => ({ l, i })).filter(({ l }) => Math.abs(l.at - ref) > 1e-9).sort((p, q) => Math.abs(p.l.at - ref) - Math.abs(q.l.at - ref)).forEach(({ l, i }) => {
        const y = base - 12 - row * 26, x = X(l.at), words = hideDist ? '?' : lbl(d.loads[i].distanceLabel, `${fmt(Math.abs(l.at - ref), 3, lang)} ${unit}`);
        g.push(line(x, y - 4, x, l.kind === 'resting' ? beamTop - 42 : l.kind === 'down' ? beamTop - 80 : beamTop, P.muted, 1, { 'stroke-dasharray': '3 3' }), dimension(rx, y, x, y, words, P, { side: -1, off: 9 }));
        row++;
      });
      if (row) g.push(line(rx, base - 12 - (row - 1) * 26 - 4, rx, beamTop, P.muted, 1, { 'stroke-dasharray': '3 3' }));
    }
    let H = under + 96;
    if (d.lengthMark) { const y = under + 104; g.push(line(x0, under + 2, x0, y + 4, P.muted, 1, { 'stroke-dasharray': '3 3' }), line(x1, under + 2, x1, y + 4, P.muted, 1, { 'stroke-dasharray': '3 3' }), dimension(x0, y, x1, y, `${fmt(b.length, 3, lang)} ${unit}`, P)); H = y + 30; }
    return frame(640, H, g, { ...o, kind: 'torque' }, o.title || W('torque'));
  },
};
export const TORQUE_KINDS = { torque };
