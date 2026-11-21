// Oomba Figures, the math pack: the number line, the measured shapes, lines and angles, segment addition, the circle,
// composite shapes, 3D solids and their nets, and mapping diagrams (docs/figures-api.md "The core and its packs").
import { register } from '../core.js';
import { NUMBER_LINES } from '../ported/numberline.js';
import { SHAPES } from '../shapes.js';
import { LINE_KINDS } from '../lines.js';
import { SEGMENT_KINDS } from '../segments.js';
import { CIRCLE_KINDS } from '../circle.js';
import { COMPOSITE_KINDS } from '../composite.js';
import { SOLID_KINDS } from '../solids.js';
import { MAPPING_KINDS } from '../mapping.js';

register('math', { ...NUMBER_LINES, ...SHAPES, ...LINE_KINDS, ...SEGMENT_KINDS, ...CIRCLE_KINDS, ...COMPOSITE_KINDS, ...SOLID_KINDS, ...MAPPING_KINDS });
