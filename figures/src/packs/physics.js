// Oomba Figures, the physics pack: forces, vectors, inclined planes, pulleys, ray diagrams, circuits, motion graphs,
// projectiles, waves and motion maps (docs/figures-api.md "The core and its packs"); since 1.7.0 circular motion, field
// lines, the lever, torque, the pendulum, springs and the roller coaster.
import { register } from '../core.js';
import { PHYSICS, CIRCUIT_PARTS, RAY_TYPES } from '../physics.js';
import { MOTION_KINDS } from '../motion.js';
import { PROJECTILE_KINDS } from '../projectile.js';
import { WAVE_KINDS } from '../waves.js';
import { CIRCULAR_KINDS } from '../circular.js';
import { FIELD_KINDS } from '../fields.js';
import { LEVER_KINDS } from '../lever.js';
import { TORQUE_KINDS } from '../torque.js';
import { PENDULUM_KINDS } from '../pendulum.js';
import { SPRING_KINDS } from '../spring.js';
import { COASTER_KINDS } from '../coaster.js';

register('physics', { ...PHYSICS, ...MOTION_KINDS, ...PROJECTILE_KINDS, ...WAVE_KINDS,
  ...CIRCULAR_KINDS, ...FIELD_KINDS, ...LEVER_KINDS, ...TORQUE_KINDS, ...PENDULUM_KINDS, ...SPRING_KINDS, ...COASTER_KINDS },
  { inclinedPlane: d => PHYSICS.inclinedPlane.sizes(d), motionArea: (d, a, b) => MOTION_KINDS.motionGraph.area(d, a, b) },
  { circuitParts: CIRCUIT_PARTS, rayTypes: RAY_TYPES });
