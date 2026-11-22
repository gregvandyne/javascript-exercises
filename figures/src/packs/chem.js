// Oomba Figures, the chemistry pack: Bohr models, orbital box diagrams, Lewis structures, and the half-life and
// titration curves (docs/figures-api.md "The core and its packs"); since 1.5.0 organic structures (skeletal) and atomic
// energy levels with transitions (energyLevels).
import { register } from '../core.js';
import { CHEM, ELEMENTS, MOLECULES, configOf, configText, bohrShells } from '../chem.js';
import { CURVES } from '../curves.js';
import { SPECTRA_KINDS } from '../spectra.js';
import { ENERGY_KINDS } from '../energy.js';
import { ATOM_KINDS } from '../atoms.js';
import { PARTICLE_KINDS } from '../particles.js';
import { skeletal } from '../skeletal.js';
import { LEVEL_KINDS } from '../levels.js';

register('chem', { ...CURVES, ...CHEM, ...SPECTRA_KINDS, ...ENERGY_KINDS, ...ATOM_KINDS, ...PARTICLE_KINDS, skeletal, ...LEVEL_KINDS },
  { titration: (d, v) => CURVES.titration.pH(d, v), halfLife: (d, t) => CURVES.halfLife.at(d, t), bohrShells,
    config: (el, q = 0) => configOf(typeof el === 'number' ? el : ELEMENTS.findIndex(e => e && e[0] === el), q), configText },
  { elements: ELEMENTS, molecules: Object.keys(MOLECULES) });
