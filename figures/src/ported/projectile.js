// Oomba Figures: a projectile's path. The ball is launched to the right at an angle above the horizontal, from level
// ground or from the top of a cliff, and lands on the ground; its path is the real parabola for its speed, angle,
// launch height and g, drawn as one exact quadratic curve (the control point is where the launch velocity would take it
// by half the flight time), with the ball again at equal time steps. Pure numbers in, pure numbers out:
// figures/src/projectile.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the path is worked out in meters and seconds from the real speed, launch
// height and g (Oomba's structured data) instead of in units of v0 and g with both set to 1, so it also gives the range,
// the greatest height and the time of flight; the label placement, the vector layout, the marks and the fitting are
// left out (figures/src/projectile.js draws).

/** { speed (m/s), angle (degrees above the horizontal), height (the launch height above the ground, m), g (m/s²) } ->
 *  the flight: time, range, the peak (if it rises), the landing, at(t) and the quadratic curve. */
export function pjFlight(speed, angle, height, g) {
  const a = (angle * Math.PI) / 180, vx = speed * Math.cos(a), vy = speed * Math.sin(a);
  const time = (vy + Math.sqrt(vy * vy + 2 * g * height)) / g;
  const at = t => ({ x: vx * t, y: height + vy * t - (g * t * t) / 2 });
  const landing = at(time), peakT = vy > 0 ? vy / g : 0, peak = at(peakT);
  const control = { x: (vx * time) / 2, y: height + (vy * time) / 2 };
  const vLand = { x: vx, y: vy - g * time };
  return { vx, vy, time, range: landing.x, peak, peakT, maxHeight: peak.y, rise: peak.y - height, landing, at, control, landingSpeed: Math.hypot(vLand.x, vLand.y), landingAngle: (Math.atan2(-vLand.y, vLand.x) * 180) / Math.PI };
}
/** The ball's places at `n` equal time steps after the launch (the last is the landing). */
export const pjPositions = (f, n) => Array.from({ length: n }, (_, i) => ({ t: ((i + 1) * f.time) / n, ...f.at(((i + 1) * f.time) / n) }));
