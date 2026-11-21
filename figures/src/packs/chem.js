// Oomba Figures, the chemistry pack: Bohr models, orbital box diagrams, Lewis structures, and the half-life and
// titration curves (docs/figures-api.md "The core and its packs").
import { register } from '../core.js';
import { CHEM, ELEMENTS, MOLECULES, configOf, configText, bohrShells } from '../chem.js';
import { CURVES } from '../curves.js';

register('chem', { ...CURVES, ...CHEM },
  { titration: (d, v) => CURVES.titration.pH(d, v), halfLife: (d, t) => CURVES.halfLife.at(d, t), bohrShells,
    config: (el, q = 0) => configOf(typeof el === 'number' ? el : ELEMENTS.findIndex(e => e && e[0] === el), q), configText },
  { elements: ELEMENTS, molecules: Object.keys(MOLECULES) });
