// Oomba Figures, the data pack: the data displays (bar graphs to the normal curve) and the probability figures and
// tables (tree and Venn diagrams, two-way tables, tables of values) (docs/figures-api.md "The core and its packs").
import { register } from '../core.js';
import { DATA_KINDS } from '../data.js';
import { PROB_KINDS } from '../prob.js';

register('data', { ...DATA_KINDS, ...PROB_KINDS });
