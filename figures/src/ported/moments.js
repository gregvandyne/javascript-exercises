// Oomba Figures: the physics of a beam's torques, with no drawing: each load's force and torque, the totals about a
// pivot, the forces at two supports, a wall's cable tension and force, and the value or the place that would balance a
// load. Places are along the beam from its left end; torques are clockwise positive as drawn (a force down to the
// right of the pivot turns the beam clockwise); forces are in N, down positive. Pure numbers in, pure numbers out:
// figures/src/torque.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; a load is { at, value, kind } in Oomba's data; the place along the
// beam that would balance a load is added (the source gives only the value); mirroring, the number writing, the answer
// lines and the verdict text are left out (Oomba writes its own worked answers).

/** A place along a beam `length` long, kept on it. */
export const tqOnBeam = (x, length) => Math.min(length, Math.max(0, x));
/** A value in the unit ("N", "kg" or "g") as a weight in N: a mass times g. */
export const tqWeight = (value, unit, g) => (unit === 'N' ? value : (unit === 'g' ? value / 1000 : value) * g);
/** A weight in N as a value in the unit. */
export const tqValue = (weight, unit, g) => (unit === 'N' ? weight : unit === 'kg' ? weight / g : (weight / g) * 1000);
/** Every force on the beam from its loads and its own weight (at its middle), in list order with the beam's last. */
export function tqForces(b) {
  const out = b.loads.map((l, i) => ({ of: i, x: tqOnBeam(l.at, b.length), down: (l.kind === 'up' ? -1 : 1) * tqWeight(l.value, b.unit, b.g) }));
  if (b.beam > 0) out.push({ of: 'beam', x: b.length / 2, down: tqWeight(b.beam, b.unit, b.g) });
  return out;
}
/** Torques about the pivot: each force's arm and torque, the clockwise and counterclockwise totals, the net (clockwise
 *  minus counterclockwise), whether it balances (within what rounding the values to the hundredth can leave), and the
 *  pivot's force up on the beam. */
export function tqPivot(b) {
  const p = tqOnBeam(b.pivot, b.length), forces = tqForces(b);
  const torques = forces.map(f => ({ force: f, arm: f.x - p, torque: f.down * (f.x - p) }));
  const clockwise = torques.reduce((t, q) => t + Math.max(0, q.torque), 0), counterclockwise = torques.reduce((t, q) => t + Math.max(0, -q.torque), 0);
  const tolerance = torques.reduce((t, q) => t + Math.abs(q.arm) * tqWeight(0.005, b.unit, b.g), 0);
  return { torques, clockwise, counterclockwise, net: clockwise - counterclockwise, balanced: Math.abs(clockwise - counterclockwise) <= tolerance + 1e-9, pivotForce: forces.reduce((t, f) => t + f.down, 0) };
}
/** The forces up at two supports A and B: torques about A give B's, and the forces up equal the forces down for A's. */
export function tqTwo(b) {
  const a = tqOnBeam(b.supportA, b.length), c = tqOnBeam(b.supportB, b.length), forces = tqForces(b), total = forces.reduce((t, f) => t + f.down, 0);
  if (Math.abs(c - a) < 1e-9) return { a, b: c, forceA: NaN, forceB: NaN, together: true, negative: null };
  const forceB = forces.reduce((t, f) => t + f.down * (f.x - a), 0) / (c - a), forceA = total - forceB, tiny = 1e-9 * Math.max(1, Math.abs(total));
  return { a, b: c, forceA, forceB, together: false, negative: forceA < -tiny ? 'A' : forceB < -tiny ? 'B' : null };
}
/** A beam held at a wall at its left end: with a cable at `cableAngle` to the beam, torques about the wall give
 *  T = Σ(W d) ÷ (d_c sin θ); the wall's force is T cos θ along the beam and the rest of the weight up. With no cable the
 *  wall holds it all: the total force up, and a torque against the loads' moment. */
export function tqWall(b) {
  const forces = tqForces(b), moment = forces.reduce((t, f) => t + f.down * f.x, 0), total = forces.reduce((t, f) => t + f.down, 0);
  if (!b.cable) return { moment, total, tension: NaN, along: 0, up: total, cableProblem: null };
  const c = tqOnBeam(b.cableAt, b.length), a = (b.cableAngle * Math.PI) / 180;
  if (c < 1e-9) return { moment, total, tension: NaN, along: NaN, up: NaN, cableProblem: 'atWall' };
  const tension = moment / (c * Math.sin(a));
  return { moment, total, tension, along: tension * Math.cos(a), up: total - tension * Math.sin(a), cableProblem: tension < -1e-9 * Math.max(1, Math.abs(total)) ? 'push' : null };
}
/** The value (in the unit) load i would need for the beam to balance on its pivot, or null when none would. */
export function tqBalancingValue(b, i) {
  const { torques } = tqPivot(b), own = torques.find(t => t.force.of === i);
  if (!own || Math.abs(own.arm) < 1e-9) return null;
  const others = torques.filter(t => t.force.of !== i).reduce((t, q) => t + q.torque, 0), sign = b.loads[i].kind === 'up' ? -1 : 1, weight = -others / (sign * own.arm);
  return weight < -1e-9 ? null : tqValue(Math.max(0, weight), b.unit, b.g);
}
/** How far from the pivot load i would have to be, on its own side, for the beam to balance, or null when no place on
 *  that side would. */
export function tqBalancingArm(b, i) {
  const { torques } = tqPivot(b), own = torques.find(t => t.force.of === i);
  if (!own || Math.abs(own.force.down) < 1e-12) return null;
  const others = torques.filter(t => t.force.of !== i).reduce((t, q) => t + q.torque, 0), arm = -others / own.force.down;
  if (Math.abs(own.arm) > 1e-9 && arm * own.arm < -1e-12) return null;
  return Math.abs(arm);
}
