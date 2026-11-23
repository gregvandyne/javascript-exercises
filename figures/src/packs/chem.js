// Oomba Figures, the chemistry pack: Bohr models, orbital box diagrams, Lewis structures, and the half-life and
// titration curves (docs/figures-api.md "The core and its packs"); since 1.5.0 organic structures (skeletal) and atomic
// energy levels with transitions (energyLevels); since 1.6.0 paper chromatograms (chromatography), galvanic cells
// (galvanicCell), phase diagrams (phaseDiagram), bond energy curves (bondEnergy), equilibrium graphs (equilibrium), rate law
// graphs (rateLaw) and VSEPR shapes (vsepr).
import { register } from '../core.js';
import { CHEM, ELEMENTS, MOLECULES, configOf, configText, bohrShells } from '../chem.js';
import { CURVES } from '../curves.js';
import { SPECTRA_KINDS } from '../spectra.js';
import { ENERGY_KINDS } from '../energy.js';
import { ATOM_KINDS } from '../atoms.js';
import { PARTICLE_KINDS } from '../particles.js';
import { skeletal } from '../skeletal.js';
import { LEVEL_KINDS } from '../levels.js';
import { chromatography } from '../chromatography.js';
import { galvanicCell } from '../cells.js';
import { phaseDiagram } from '../phase.js';
import { CHEM_GRAPH_KINDS } from '../chemgraphs.js';
import { vsepr } from '../vsepr.js';

register('chem', { ...CURVES, ...CHEM, ...SPECTRA_KINDS, ...ENERGY_KINDS, ...ATOM_KINDS, ...PARTICLE_KINDS, skeletal, ...LEVEL_KINDS, chromatography, galvanicCell, phaseDiagram, ...CHEM_GRAPH_KINDS, vsepr },
  { titration: (d, v) => CURVES.titration.pH(d, v), halfLife: (d, t) => CURVES.halfLife.at(d, t), bohrShells,
    config: (el, q = 0) => configOf(typeof el === 'number' ? el : ELEMENTS.findIndex(e => e && e[0] === el), q), configText },
  { elements: ELEMENTS, molecules: Object.keys(MOLECULES) });
