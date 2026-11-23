// Oomba Figures: circular motion's layout and the sizes of its arrows. Motion is uniform, so every velocity arrow in a
// figure is the same length, and so is every acceleration arrow. Seen from above, the object goes round a circle;
// on a vertical circle (a ball on a string, a car in a loop, over a hill or through a dip) the net force toward the
// middle is the same at every point, so the tension or normal force is gravity's length less at the top and more at
// the bottom (in units of gravity); a conical pendulum hangs from a pivot with its bob on a horizontal circle seen
// squashed. Pure numbers in, pure numbers out: figures/src/circular.js checks the data, works out the answers and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; only the sizes, the places on the circle and the contact force's
// length are kept; the label placer, the objects' shapes, the side-by-side arrows and the notation are left out
// (figures/src/circular.js draws, and works the real numbers out from the teacher's speed and radius).

/** The top view: its circle, and how long a velocity and an inward arrow are. */
export const CM_TOP = { centre: { x: 320, y: 210 }, r: 135, velocity: 76, inward: 68 };
/** The vertical circle: its circle, a velocity arrow, and a force of length 1 (gravity's). */
export const CM_VERTICAL = { centre: { x: 320, y: 195 }, r: 122, velocity: 64, unit: 42 };
/** Over a hill or through a dip only one point is drawn, so a force of length 1 can be longer. */
export const CM_GROUND_UNIT = 62;
/** The net force toward the middle, in units of gravity, as the picture draws it (not to the teacher's numbers). */
export const CM_NET = { circle: 1.7, ground: 0.4 };
/** The tension or normal force at a point, in units of gravity: shorter than gravity at the top, longer at the bottom. */
export function cmContact(held, p) {
  const n = held === 'hill' ? 1 - CM_NET.ground : held === 'dip' ? 1 + CM_NET.ground : { top: CM_NET.circle - 1, side: CM_NET.circle, bottom: CM_NET.circle + 1 }[p];
  return Math.round(n * 100) / 100;
}
/** The conical pendulum: its pivot, string, gravity arrow and how squashed its circle is seen from the side. */
export const CM_CONICAL = { pivot: { x: 300, y: 40 }, length: 240, gravity: 62, squash: 0.22 };
/** Where the object is drawn on a vertical circle, in the order top, side, bottom: a hill is always the top, a dip the bottom. */
export function cmPoints(held, points) {
  if (held === 'hill') return ['top'];
  if (held === 'dip') return ['bottom'];
  return { top: ['top'], bottom: ['bottom'], side: ['side'], topBottom: ['top', 'bottom'], all: ['top', 'side', 'bottom'] }[points] || ['top', 'bottom'];
}
