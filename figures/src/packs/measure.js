// Oomba Figures, the measure pack: reading an instrument, one kind for every subject (thermometer, measuring cylinder,
// spring scale, ruler, vernier caliper, micrometer), and the protractor (docs/figures-api.md "The core and its packs").
import { register } from '../core.js';
import { READINGS } from '../readings.js';
import { PROTRACTOR_KINDS } from '../protractor.js';

register('measure', { ...READINGS, ...PROTRACTOR_KINDS });
