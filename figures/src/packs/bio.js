// Oomba Figures, the biology pack (1.3.0): population growth and predator-prey graphs, enzyme activity and
// photosynthesis rate graphs, Punnett squares and pedigrees, protein synthesis, gel electrophoresis and osmosis
// (docs/figures-api.md "Biology (1.3.0)"); since 1.7.0 the cladogram. Reading a micropipette is a type of `reading`, in
// the measure pack.
import { register } from '../core.js';
import { ECOLOGY_KINDS } from '../ecology.js';
import { RATE_KINDS } from '../rates.js';
import { GENETICS_KINDS } from '../genetics.js';
import { MOLECULAR_KINDS } from '../molecular.js';
import { OSMOSIS_KINDS } from '../osmosis.js';
import { CLADO_KINDS } from '../cladogram.js';

register('bio', { ...ECOLOGY_KINDS, ...RATE_KINDS, ...GENETICS_KINDS, ...MOLECULAR_KINDS, ...OSMOSIS_KINDS, ...CLADO_KINDS });
