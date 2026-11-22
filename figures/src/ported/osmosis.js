// Oomba Figures: the biology of osmosis, worked out from the concentrations: which side is hypertonic, which way water
// and each solute that can cross move, and what happens to the cell, the levels or the bag. Only solutes that cannot
// cross count toward tonicity; one that can cross moves from the higher to the lower concentration until it is the same
// on both sides, and does not change the answer. Water moves from the hypotonic side to the hypertonic side. A red blood
// cell in a hypertonic solution shrinks (crenated), in an isotonic one stays normal, in a hypotonic one swells (and may
// burst, lysed); a plant cell is plasmolyzed, flaccid or turgid; a U-tube's or split beaker's level rises on the
// hypertonic side; a dialysis bag shrinks, stays the same or swells. How strongly the sides differ, from 0 to 1, is
// |outside - inside| / (inside + outside). Totals closer than a billionth of the larger count as equal. A solute is one
// particle per unit given (NaCl is not split into two ions). Pure numbers in, pure words out: figures/src/osmosis.js
// checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the outcomes are keys, not English words; the three-up panels and their
// shuffled order, the particle scattering, the scenes' drawing and the settings are left out (Oomba draws its own).

const OS_SAME = 1e-9;
export const OS_SCENES = ['blood', 'plant', 'beaker', 'utube', 'bag'];
export const osIsCell = scene => scene === 'blood' || scene === 'plant';
export const osTwoSided = scene => scene === 'beaker' || scene === 'utube';
/** The concentration of solutes that cannot cross, on one side ("inside" or "outside"). */
export const osOsmotic = (solutes, side) => solutes.filter(x => !x.cross).reduce((sum, x) => sum + x[side], 0);
/** How the outside (or side B) compares with the inside (or side A). */
export function osTonicity(inside, outside) {
  if (Math.abs(outside - inside) <= OS_SAME * Math.max(Math.abs(inside), Math.abs(outside))) return 'isotonic';
  return outside > inside ? 'hypertonic' : 'hypotonic';
}
export const osOpposite = t => (t === 'hypertonic' ? 'hypotonic' : t === 'hypotonic' ? 'hypertonic' : 'isotonic');
/** Net water movement: into the cell (or to side A) when the outside is hypotonic. */
export const osWater = t => (t === 'hypotonic' ? 'in' : t === 'hypertonic' ? 'out' : 'none');
/** A solute that can cross moves down its gradient; one that cannot, or is already even, does not. */
export function osSoluteFlow(x) {
  if (!x.cross || osTonicity(x.inside, x.outside) === 'isotonic') return 'none';
  return x.inside > x.outside ? 'out' : 'in';
}
/** What a scene ends as, for the outside's tonicity. */
export function osOutcome(scene, t, burst = false) {
  if (scene === 'blood') return t === 'hypertonic' ? 'crenated' : t === 'isotonic' ? 'normal' : burst ? 'burst' : 'swollen';
  if (scene === 'plant') return t === 'hypertonic' ? 'plasmolyzed' : t === 'isotonic' ? 'flaccid' : 'turgid';
  if (osTwoSided(scene)) return t === 'hypertonic' ? 'risesB' : t === 'isotonic' ? 'level' : 'risesA';
  return t === 'hypertonic' ? 'shrinks' : t === 'isotonic' ? 'same' : 'swells';
}
/** How strongly the two sides differ, 0 (the same) to 1 (one is pure water). */
export function osDifference(inside, outside) { const total = inside + outside; return total > 0 ? Math.abs(outside - inside) / total : 0; }
