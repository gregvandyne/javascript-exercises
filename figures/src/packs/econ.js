// Oomba Figures, the economics pack (1.4.0): supply and demand, the money markets (the money market, loanable funds and
// the market for reserves), the business cycle, the Phillips curve, production possibilities, the AD-AS model and the
// firm's cost and revenue curves (docs/figures-api.md "Economics (1.4.0)").
import { register } from '../core.js';
import { MARKET_KINDS } from '../markets.js';
import { MACRO_KINDS } from '../macro.js';
import { FIRM_KINDS } from '../firm.js';

register('econ', { ...MARKET_KINDS, ...MACRO_KINDS, ...FIRM_KINDS });
