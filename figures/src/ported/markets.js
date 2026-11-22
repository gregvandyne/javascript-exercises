// Oomba Figures: the markets behind the supply and demand graph and the money market graphs (1.4.0, the economics
// pack), on the hidden 0-to-10 grid a schematic graph is drawn on. Supply and demand: each schematic shape as a
// straight line (where it meets the price axis and how steep it is), from steep (inelastic) to flat (elastic), with
// upright and flat lines for the perfect extremes; a numbered curve through a schedule run on to the axes so the
// surplus it bounds starts at a quantity of 0. The money market: an upright money supply and a gently falling money
// demand through (5, 5); loanable funds: a steeper supply and demand through (5, 5), so a shift moves the real
// interest rate far enough to read; the market for reserves: the demand for reserves flat at the discount rate,
// sloping, then flat at the administered rate, with the supply of reserves on its flat bottom (ample reserves) or on
// its slope (limited reserves), and how far each graph's shifts move its curves. Pure numbers in, pure numbers out:
// figures/src/markets.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the settings, the setups, the label placement, the arrow placement and
// the address format are left out (Oomba checks the data, draws its own axes and places its own labels).

/** Far enough to run a straight curve off any schematic graph. */
export const MK_FAR = 100;
/** The schematic shapes a supply or demand curve takes. */
export const MK_SHAPES = ['normal', 'steep', 'flat', 'vertical', 'horizontal'];
const MK_DEMAND = { normal: { at: 9, slope: -0.8 }, steep: { at: 9.6, slope: -1.6 }, flat: { at: 7, slope: -0.4 } };
const MK_SUPPLY = { normal: { at: 1, slope: 0.8 }, steep: { at: 0.4, slope: 1.6 }, flat: { at: 3, slope: 0.4 } };
/** A schematic demand or supply curve: a straight line through the graph, upright or flat for the perfect extremes. */
export function mkSchematic(kind, shape) {
  if (shape === 'vertical') return [{ x: 5, y: -MK_FAR }, { x: 5, y: MK_FAR }];
  if (shape === 'horizontal') return [{ x: -MK_FAR, y: 5 }, { x: MK_FAR, y: 5 }];
  const { at, slope } = (kind === 'demand' ? MK_DEMAND : MK_SUPPLY)[shape];
  return [{ x: -MK_FAR, y: at - slope * MK_FAR }, { x: MK_FAR, y: at + slope * MK_FAR }];
}
/**
 * A numbered curve run on straight from its first row to the axes, as its first two rows head: demand up to the price
 * axis, supply down to either axis. Consumer and producer surplus run from a quantity of 0, so the curve bounding them
 * has to reach it.
 */
export function mkToAxes(c, kind) {
  if (c.length < 2 || c[0].x <= 0) return c;
  const [a, b] = c;
  if (b.x === a.x) return c;
  const m = (b.y - a.y) / (b.x - a.x);
  if (kind === 'demand' ? m >= 0 : m <= 0) return c;
  const at0 = a.y - m * a.x;
  if (kind === 'demand' || at0 >= 0) return [{ x: 0, y: at0 }, ...c];
  return [{ x: a.x - a.y / m, y: 0 }, ...c];
}

// ---------------------------------------------------------------- the money markets
/** The straight curves through (5, 5), each drawn from `from` across to `to`. */
export const MM_STRAIGHT = {
  money: { demand: { slope: -0.7, from: 0, to: 9.4 } },
  funds: { supply: { slope: 1.2, from: 5 - 4 / 1.2, to: 5 + 4 / 1.2 }, demand: { slope: -1.2, from: 5 - 4 / 1.2, to: 5 + 4 / 1.2 } },
};
/**
 * The demand for reserves: flat at the discount rate (high), sloping from x0 to x1, flat at the administered rate
 * (low), and where the supply of reserves crosses it (supply). With ample reserves the slope is short and the supply
 * far out on the flat bottom; with limited reserves the slope is long and the supply halfway down it.
 */
export const MM_RESERVES = {
  ample: { x0: 2.1, x1: 3.38, high: 6.6, low: 3.4, supply: 7 },
  limited: { x0: 1.2, x1: 5.6, high: 7.6, low: 2.4, supply: 3.4 },
};
/** Where the demand for reserves' slope, through (x0, high) and (x1, low), is at the rate y. */
export const mmSlopeX = (R, y) => R.x0 + ((R.high - y) * (R.x1 - R.x0)) / (R.high - R.low);
/**
 * The demand for reserves with sharp corners. With limited reserves it moves dx across, slope and all; with ample
 * reserves its rates move dy up and the slope stays where it is, cut off by the discount rate over it and the
 * administered rate under it.
 */
export function mmReservesDemand(R, dx, dy) {
  const high = R.high + dy, low = R.low + dy, kink = mmSlopeX(R, low) + dx;
  const bottom = Array.from({ length: Math.max(0, Math.ceil((10 - kink) / 0.5)) }, (_, k) => ({ x: kink + (k + 1) * 0.5, y: low }));
  return [{ x: -MK_FAR, y: high }, { x: mmSlopeX(R, high) + dx, y: high }, { x: kink, y: low }, ...bottom, { x: MK_FAR, y: low }];
}
/** How far a shift moves a curve, as a share of this: the axis on the money market, more on loanable funds, less on reserves. */
export const MM_SPAN = { money: 10, funds: 12.5, ample: 8, limited: 6 };
/** How high the demand for reserves' flat top may go; how far an upright supply curve may move. */
export const MM_RESERVES_TOP = 9.2;
export const MM_UPRIGHT = { min: 0.6, max: 9 };
/** A straight curve through (5, 5) with this slope, moved dx across. */
export const mmStraight = (slope, dx = 0) => [{ x: -MK_FAR, y: 5 + slope * (-MK_FAR - 5 - dx) }, { x: MK_FAR, y: 5 + slope * (MK_FAR - 5 - dx) }];
