// Oomba Figures: a circuit as a series/parallel tree. The loop is a list of parts and groups in order round it; a
// parallel group holds branches, and a branch is a part or a series group, nested at most 3 deep with at most 8 parts.
// Parts name themselves in reading order (R1, R2, L1...; plain R when there is only one) unless they are given a name.
// Pure data in, pure data out: figures/src/network.js checks the data, works out the currents and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; a tree is Oomba's structured data ({ series: [...] }, { parallel: [...] }
// and parts with their type) instead of the original's short address string, so its parser, its writer and the editing
// helpers (tidying, points, current arrows) are left out; names are plain text with a subscript digit.

export const CT_MAX_PARTS = 8;
export const CT_MAX_DEPTH = 3;
/** What an item is: 'part', 'series' or 'parallel' (null for anything else). */
export const ctType = it => (it && typeof it === 'object' && !Array.isArray(it) ? (Array.isArray(it.series) ? 'series' : Array.isArray(it.parallel) ? 'parallel' : typeof it.type === 'string' ? 'part' : null) : null);
export const ctItems = it => it.series || it.parallel || [];
/** Every part, in reading order (the tree's order). */
export function ctParts(items, out = []) { for (const it of items) { if (ctType(it) === 'part') out.push(it); else if (ctType(it)) ctParts(ctItems(it), out); } return out; }
/** How deep an item's groups go: 0 for a part, 1 for a group of parts. */
export const ctDepth = it => (ctType(it) === 'part' ? 0 : 1 + Math.max(0, ...ctItems(it).map(ctDepth)));
const CT_PREFIX = { battery: 'ε', cell: 'ε', resistor: 'R', bulb: 'L', switch: 'S', ammeter: 'A', 'variable-resistor': 'R' };
const CT_SUB = '₀₁₂₃₄₅₆₇₈₉';
/** Each part's name, in reading order: R₁, R₂... or plain R when it is the only one of its kind; a given name stays. */
export function ctNames(items) {
  const parts = ctParts(items), total = new Map(), seen = new Map(), names = new Map(), pre = p => CT_PREFIX[p.type] || '';
  for (const p of parts) if (!p.name) total.set(pre(p), (total.get(pre(p)) || 0) + 1);
  for (const p of parts) {
    if (p.name) { names.set(p, String(p.name)); continue; }
    const k = pre(p), n = (seen.get(k) || 0) + 1; seen.set(k, n);
    names.set(p, k && total.get(k) > 1 ? `${k}${String(n).split('').map(c => CT_SUB[+c]).join('')}` : k);
  }
  return names;
}
