// Oomba Figures: where a pendulum goes in its figure, and how long its force arrows are. The string is always the same
// length on the page, so the angle alone sets the shape; the pivot sits a little toward the side the bob is on, so
// that at the widest angle both the bob and the height mark on the far side fit. Weight is drawn about the right size
// (longer at a wide angle, so the tension and weight's component along the string, both mg cos θ, still show past the
// bob), and the tension is as long as mg cos θ, which is right where the bob is released and momentarily at rest.
// Pure numbers in, pure numbers out: figures/src/pendulum.js checks the data, works out the answers and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the pivot's place takes the picture, the angle, the side and which marks
// are on as plain arguments; the label placer, the ceiling and the arcs' path writing are left out.

export const PD_W = 640, PD_H = 420, PD_LENGTH = 256, PD_BOB_R = 14, PD_WEIGHT = 96, PD_MIN_SHOWN = 32, PD_MIN_SHOWN_ACROSS = 22, PD_VELOCITY = 64, PD_ARC_R = 50, PD_HEIGHT_GAP = 16;
const PD_CEILING_HALF = 70, PD_ROOM = { bob: 34, forces: 100, under: 34, height: 30 }, PD_HATCH = 10;
/** How long weight is drawn at θ (degrees): PD_WEIGHT, or longer at a wide angle so mg cos θ still shows past the bob. */
export const pdWeightOf = deg => Math.max(PD_WEIGHT, (PD_BOB_R + PD_MIN_SHOWN) / Math.cos((deg * Math.PI) / 180));
/** The bob's middle at `deg` from the vertical (to the right for a positive angle). */
export const pdBobAt = (pivot, deg) => { const a = (deg * Math.PI) / 180; return { x: pivot.x + PD_LENGTH * Math.sin(a), y: pivot.y + PD_LENGTH * Math.cos(a) }; };
/** Where the pivot goes, so the drawing is in the middle of the figure with room for its labels. */
export function pdPivot(swing, angle, side, arc, heightMark, angleMark, forces) {
  const sign = side === 'left' ? -1 : 1, rad = (angle * Math.PI) / 180, across = PD_LENGTH * Math.sin(rad), down = PD_LENGTH * Math.cos(rad);
  const near = across + PD_BOB_R + (forces ? PD_ROOM.forces : PD_ROOM.bob);
  const far = Math.max(PD_CEILING_HALF, swing || arc ? across + PD_BOB_R + PD_ROOM.bob : 0, heightMark ? across + PD_BOB_R + PD_HEIGHT_GAP + PD_ROOM.height : 0);
  const x = Math.max(4 + far, Math.min(PD_W - 4 - near, PD_W / 2 + (far - near) / 2));
  const lowest = swing || arc || heightMark || angleMark ? PD_LENGTH + (swing ? PD_BOB_R + PD_ROOM.under : 0) : 0;
  const bottom = Math.max(lowest, down + (forces ? pdWeightOf(angle) + 40 : PD_BOB_R + PD_ROOM.bob));
  const y = Math.max(PD_HATCH + 4, (PD_H - bottom - PD_HATCH) / 2 + PD_HATCH);
  return { x: sign > 0 ? x : PD_W - x, y };
}
