// Core behaviours ("parts") an entity can carry: movement (bob, patrol, follow, fly) and feel (lantern, glow).
// Each is (entity, opts) -> (entity, dt) => void. Gameplay roles (player, collectible, hazard, goal, quizGate...) are
// registered by the game layer on the same table.
import { PALETTE } from './tokens.js';

export const CORE_PARTS = {
  /** move: velocity that moves the entity. vx / vy (units per second) are only animation hints on a plain entity (the
   *  walk/run clip); with move they are integrated every step, with optional gravity, drag, a floor (a y, or
   *  (x) => y | null) and x limits (minX, maxX). Sets e.grounded. move({vx: 120}) also sets the starting speed. */
  move: (e, o) => {
    const g = +o.gravity || 0, drag = +o.drag || 0, bounce = +o.bounce || 0, floor = o.floor;
    if (o.vx != null) e.vx = +o.vx; if (o.vy != null) e.vy = +o.vy;
    return (e2, dt) => {
      e.vy += g * dt; if (drag) { const k = Math.max(0, 1 - drag * dt); e.vx *= k; if (!g) e.vy *= k; }
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (o.minX != null && e.x < o.minX) { e.x = o.minX; e.vx = Math.abs(e.vx) * bounce; }
      if (o.maxX != null && e.x > o.maxX) { e.x = o.maxX; e.vx = -Math.abs(e.vx) * bounce; }
      const fy = typeof floor === 'function' ? floor(e.x) : floor;
      e.grounded = false;
      if (fy != null && isFinite(fy) && e.y >= fy && e.vy >= 0) { e.y = fy; e.vy = bounce && e.vy > 60 ? -e.vy * bounce : 0; e.grounded = e.vy === 0; e.groundY = fy; }
    };
  },
  /** bob: a gentle float (pickups). */
  bob: (e, o) => { const amp = o.amp || 6, hz = o.hz || 0.8, ph = e.rng() * 6.28; let t = 0; const y0 = () => e.baseY != null ? e.baseY : (e.baseY = e.y);
    return (e2, dt) => { t += dt; e.y = y0() + Math.sin(t * hz * 6.283 + ph) * amp; }; },
  /** patrol: walk between x - range and x + range, turning at the ends. */
  patrol: (e, o) => { const range = o.range || 120, sp = o.speed || 60; const x0 = e.x; let dir = 1;
    return (e2, dt) => { e.vx = sp * dir; e.x += e.vx * dt; if (e.x > x0 + range) { e.x = x0 + range; dir = -1; } else if (e.x < x0 - range) { e.x = x0 - range; dir = 1; } e.flip = dir < 0; }; },
  /** follow: trail a target (an Entity) at a distance with a soft spring. */
  follow: (e, o) => { const gap = o.gap || 70; return (e2, dt) => { const t = o.target; if (!t) return;
    const tx = t.x - (t.flip ? -gap : gap), dx = tx - e.x; e.vx = dx * 4; e.x += e.vx * dt; e.y += ((t.y) - e.y) * Math.min(1, dt * 6); if (Math.abs(dx) > 4) e.flip = dx < 0; }; },
  /** fly: hover in a figure-eight around the start point. */
  fly: (e, o) => { const ax = o.rangeX || 40, ay = o.rangeY || 18, sp = o.speed || 1; const x0 = e.x, y0 = e.y; let t = e.rng() * 6;
    return (e2, dt) => { t += dt * sp; const nx = x0 + Math.sin(t) * ax; e.vx = (nx - e.x) / Math.max(dt, 1e-3); e.x = nx; e.y = y0 + Math.sin(t * 2) * ay; e.flip = Math.cos(t) < 0; }; },
  /** lantern: a warm point light at the top of the entity that ignites at dusk. */
  lantern: (e, o) => { e.light = e.stage.light({ follow: e, dy: o.dy != null ? o.dy : -e.size * 0.78, radius: o.radius || 230, color: o.color || PALETTE.spark[1], intensity: o.intensity || 1.1 }); return () => {}; },
  /** glow: the whole sprite counts as emissive (blooms on Glaze+, stays bright at night). */
  glow: (e, o) => { e.emissive = o.amount == null ? 1 : +o.amount; return () => {}; },
  shadow: (e, o) => { e.shadow = o.on !== false; return () => {}; },
};
