// Oomba Figures: the motion a list of segments describes, worked out from its velocity-time graph. Each segment is a
// straight line there, so position (the area under it) and acceleration (its slope) follow exactly, and the position,
// velocity and acceleration graphs and the motion map always agree. A segment is at rest, moves at a constant velocity
// forward or back, or speeds up or slows down to its speed from the velocity the segment before ended at (so velocity
// only jumps going into a constant velocity or rest, as textbook graphs draw it). Pure numbers in, pure numbers out:
// figures/src/motion.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; a segment that cannot reach its speed (speeding up to a speed it is
// already past, slowing down to one it is already below) is reported so Oomba's check can refuse it, rather than drawn
// keeping its old speed; the boundaries list, the tangent and the answer-key sentences are left out (Oomba writes its
// own answers from OF.solve).

export const MO_KINDS = ['rest', 'forward', 'back', 'faster', 'slower'];
/** segments -> { pieces: [{ t0, t1, v0, v1, x0, x1, a }], end, unreached: [index] }. */
export function moMotion(segments, start = 0) {
  const pieces = [], unreached = [];
  let t = 0, x = start, v = 0;
  segments.forEach((seg, i) => {
    let v0 = v, v1 = v;
    if (seg.kind === 'rest') v0 = v1 = 0;
    else if (seg.kind === 'forward') v0 = v1 = seg.speed;
    else if (seg.kind === 'back') v0 = v1 = -seg.speed;
    else if (seg.kind === 'faster' ? seg.speed <= Math.abs(v) : seg.speed >= Math.abs(v)) unreached.push(i);
    // speeding up from rest goes the way it is set; otherwise it keeps going the way it was (slowing down stops at rest)
    else v1 = (v === 0 ? (seg.dir === 'back' ? -1 : 1) : Math.sign(v)) * seg.speed;
    const d = seg.duration, x1 = x + ((v0 + v1) / 2) * d;
    pieces.push({ t0: t, t1: t + d, v0, v1, x0: x, x1, a: (v1 - v0) / d });
    t += d; x = x1; v = v1;
  });
  return { pieces, end: t, unreached };
}
/** The piece moving at time t: the later one at a boundary, the last one at the end. */
export const moPieceAt = (m, t) => m.pieces.find(p => t < p.t1 - 1e-12) || m.pieces[m.pieces.length - 1] || null;
/** Where it is at time t. */
export function moPositionAt(m, t) {
  const p = moPieceAt(m, t); if (!p) return 0;
  const u = Math.min(Math.max(t, p.t0), p.t1) - p.t0;
  return p.x0 + p.v0 * u + (p.a * u * u) / 2;
}
/** Its velocity at time t (the later piece's at a boundary). */
export function moVelocityAt(m, t) {
  const p = moPieceAt(m, t); if (!p) return 0;
  return p.v0 + p.a * (Math.min(Math.max(t, p.t0), p.t1) - p.t0);
}
/** The letter at boundary i: A at the start, then B, C... */
export const moLetter = i => String.fromCharCode(65 + i);
