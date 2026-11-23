// Oomba Figures: a spring's coil, drawn between two points as one path: a short straight lead at each end and the turns
// between them. The coil is redrawn for every length, never scaled, so a stretched or squashed spring keeps its number
// of turns, its width and its line weight, and looks like the same spring pulled out or pushed in. Two styles: a
// zigzag (the usual textbook spring) or loops (a helix seen from the side); loops pushed close together are drawn
// narrower along the spring, so neighboring loops never cross. A spring gets about one turn for every 15 units of its
// natural length. Pure numbers in, a path out: figures/src/spring.js draws the rest.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the path is written with Oomba's two-decimal rounding; the spring
// figure's layout (copies, supports, labels) is left out (figures/src/spring.js lays it out).

export const SP_COIL_LEAD = 10;
const SP_LOOP_REACH = 8, SP_LOOP_SHARE = 0.42, SP_LOOP_STEPS = 28, SP_TURN_LENGTH = 15;
const spR = n => Math.round(n * 100) / 100;
/** How many turns a spring this long at its natural length has. */
export const spTurnsFor = natural => Math.max(4, Math.round(natural / SP_TURN_LENGTH));
/** The coil from `from` to `to`, with `turns` turns, `width` across, in the given style; both ends lie exactly on them. */
export function spCoilPath(from, to, turns, width, style = 'zigzag', lead = SP_COIL_LEAD) {
  const xy = p => `${spR(p.x)} ${spR(p.y)}`, length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < 1e-6) return `M ${xy(from)} L ${xy(from)}`;
  const u = { x: (to.x - from.x) / length, y: (to.y - from.y) / length }, n = { x: -u.y, y: u.x };
  const at = (along, across) => ({ x: from.x + u.x * along + n.x * across, y: from.y + u.y * along + n.y * across });
  const ends = Math.min(lead, length * 0.15), body = length - 2 * ends, count = Math.max(1, Math.round(turns)), half = width / 2, pts = [from, at(ends, 0)];
  if (style === 'zigzag') {
    const step = body / (count * 2);
    for (let i = 0; i < count * 2; i++) pts.push(at(ends + (i + 0.5) * step, i % 2 ? -half : half));
  } else {
    const halves = count + 0.5;
    let pitch = (body - 2 * SP_LOOP_REACH) / halves, reach = SP_LOOP_REACH;
    if (reach > pitch * SP_LOOP_SHARE) { pitch = body / (halves + 2 * SP_LOOP_SHARE); reach = pitch * SP_LOOP_SHARE; }
    const t0 = -Math.PI / 2, steps = Math.round(halves * SP_LOOP_STEPS);
    for (let i = 1; i < steps; i++) { const t = t0 + (i / SP_LOOP_STEPS) * 2 * Math.PI; pts.push(at(ends + (pitch * (t - t0)) / (2 * Math.PI) + reach * (Math.sin(t) + 1), half * Math.cos(t))); }
  }
  pts.push(at(length - ends, 0), to);
  return `M ${pts.map(xy).join(' L ')}`;
}
