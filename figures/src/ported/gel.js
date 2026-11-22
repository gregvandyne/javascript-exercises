// Oomba Figures: how far a band runs in an agarose gel, and the ladders it is read against. Within a gel's resolving
// range the distance from the well goes down in a straight line with log10 of the fragment's size, so smaller fragments
// run farther; past either end the bands crowd together instead (the biggest bunch up near the wells, the smallest
// toward the far end), still in order, as on a real gel. The ranges each gel separates well are from Thermo Fisher's
// and miniPCR's agarose tables (0.8% between their 0.7% and 1%). Bands too close to leave a clear gap run together as
// one thicker band; more DNA makes a band a little thicker and darker. The ladders are real products, each band's size
// and DNA from the makers' data sheets: NEB's 100 bp ladder (N3231; its 500 and 517 bp pieces run together) and 1 kb
// ladder (N3232, with the bright 3.0 kb band), and lambda DNA cut with HindIII (one copy of each piece of the 48,502 bp
// genome, so the small ones are faint). Pure numbers in, pure numbers out: figures/src/molecular.js checks and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the ladders keep their bands but not their English names; reading typed
// band sizes, the scenarios, the looks and the settings are left out (Oomba takes the bands as data).

export const GE_GELS = ['0.8', '1', '1.5', '2'];
export const GE_RANGES = { '0.8': [800, 10000], 1: [500, 10000], 1.5: [200, 3000], 2: [100, 2000] };
const GE_BIG = 0.08, GE_SMALL = 0.3;
function geCrowd(t) {
  if (t < 0) return -GE_BIG * (1 - Math.exp(t / GE_BIG));
  if (t > 1) return 1 + GE_SMALL * (1 - Math.exp(-(t - 1) / GE_SMALL));
  return t;
}
/** How far along the run a fragment of bp ends up, 0 (the wells' end) to 1 (the far end); smaller for a larger size. */
export function geRun(bp, gel) {
  const [low, high] = GE_RANGES[gel], t = (Math.log10(high) - Math.log10(bp)) / (Math.log10(high) - Math.log10(low));
  return (geCrowd(t) + GE_BIG) / (1 + GE_BIG + GE_SMALL);
}
export const geInRange = (bp, gel) => bp >= GE_RANGES[gel][0] && bp <= GE_RANGES[gel][1];
/** A band's height (px): more DNA makes it a little thicker, never thinner; and how dark it is, 0.3 to 1. */
export const GE_BAND_H = 6;
export const geThickness = amount => GE_BAND_H * Math.min(1.6, Math.max(1, 1 + 0.3 * Math.log2(amount)));
export const geStrength = amount => Math.min(1, Math.max(0.3, Math.sqrt(amount)));
const GE_MIN_GAP = 2;
/** A lane's bands as drawn, top down: [{ sizes (more than one where they ran together), top, bottom, amount }]. */
export function geDrawBands(bands, y) {
  const sorted = [...bands].sort((a, b) => b.bp - a.bp), drawn = [];
  let last = null;
  for (const band of sorted) {
    const mid = y(band.bp), h = geThickness(band.amount), piece = { top: mid - h / 2, bottom: mid + h / 2 }, cur = drawn[drawn.length - 1];
    if (cur && last && mid - last.mid < (last.h + h) / 2 + GE_MIN_GAP) {
      if (!cur.sizes.includes(band.bp)) cur.sizes.push(band.bp);
      cur.top = Math.min(cur.top, piece.top); cur.bottom = Math.max(cur.bottom, piece.bottom); cur.amount += band.amount;
    } else drawn.push({ sizes: [band.bp], ...piece, amount: band.amount });
    last = { mid, h };
  }
  return drawn;
}
/** The ladders: their bands, largest first, as [bp, ng of DNA in a 0.5 microgram load]. */
export const GE_LADDERS = {
  '100bp': [[1517, 45], [1200, 35], [1000, 95], [900, 27], [800, 24], [700, 21], [600, 18], [517, 48.5], [500, 48.5], [400, 38], [300, 29], [200, 25], [100, 48]],
  '1kb': [[10000, 42], [8000, 42], [6000, 50], [5000, 42], [4000, 33], [3000, 125], [2000, 48], [1500, 36], [1000, 42], [500, 21]],
  lambda: [[23130, 238], [9416, 97], [6557, 68], [4361, 45], [2322, 24], [2027, 21], [564, 5.8], [125, 1.3]],
};
/** A ladder's bands as drawn: each size and its DNA against the ladder's average band (a typical band is 1). */
export function geLadderBands(id) {
  const bands = GE_LADDERS[id], average = bands.reduce((s, [, ng]) => s + ng, 0) / bands.length;
  return bands.map(([bp, ng]) => ({ bp, amount: ng / average }));
}
