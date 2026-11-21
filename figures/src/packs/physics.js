// Oomba Figures, the physics pack: forces, vectors, inclined planes, pulleys, ray diagrams, circuits, motion graphs,
// projectiles, waves and motion maps (docs/figures-api.md "The core and its packs").
import { register } from '../core.js';
import { PHYSICS, CIRCUIT_PARTS, RAY_TYPES } from '../physics.js';
import { MOTION_KINDS } from '../motion.js';
import { PROJECTILE_KINDS } from '../projectile.js';
import { WAVE_KINDS } from '../waves.js';

register('physics', { ...PHYSICS, ...MOTION_KINDS, ...PROJECTILE_KINDS, ...WAVE_KINDS },
  { inclinedPlane: d => PHYSICS.inclinedPlane.sizes(d), motionArea: (d, a, b) => MOTION_KINDS.motionGraph.area(d, a, b) },
  { circuitParts: CIRCUIT_PARTS, rayTypes: RAY_TYPES });
