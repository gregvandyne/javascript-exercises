// Oomba Figures: a cladogram's tree and where everything on it goes. Taxa (the tips, each a name) are grouped into
// clades, each clade with the trait its members share, gained on the branch leading into it; the root's trait goes on
// the root stem, and a taxon can have a trait of its own on its branch. A clade with one member is just that member. A
// ladder (comb) tree is the classic school cladogram: each trait is shared by one taxon and every taxon after it.
// The tree is laid out along the tips (t) and from the tips toward the root (d): a diagonal cladogram has its tips
// along the top, a rectangular phylogenetic tree down the right. Trait labels go beside their branches on the side
// toward the root; where one would touch another label or a branch, the tips are spread farther apart and the tree is
// laid out again. Pure data in, pure numbers out: figures/src/cladogram.js checks the data, answers and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the layout takes its tree and its choices as plain arguments; the four
// ready-made trees are kept as data; the editor's edits (add, pair, move, remove, ungroup), the answer lines and the
// screen reader text are left out (Oomba's data is the tree itself, and Oomba writes its own answers).

export const CL_MIN_TAXA = 2, CL_MAX_TAXA = 16, CL_MAX_LABEL = 40;
export const CL_NAME_SIZE = 16, CL_TRAIT_SIZE = 14, CL_NUMBER_R = 10, CL_NAME_BLANK_W = 70, CL_TRAIT_BLANK_W = 70, CL_TICK = 7, CL_NAME_LINE = 19;
const CL_TEXT_GAP = 5, CL_STEM = 36, CL_TOP_GAP = 72, CL_NAME_WRAP = 110, CL_RIGHT_GAP = 44, CL_MIN_STEP = 56, CL_MARGIN = 4, CL_SPREAD = 16, CL_MAX_SPREADS = 16;
export const clIsClade = n => Array.isArray(n.children);
export const clTaxon = (name, trait) => (trait === undefined ? { name } : { name, trait });
export const clClade = (trait, ...children) => ({ trait, children });
/** The tips, left to right (top to bottom when the tips are on the right). */
export const clTaxaOf = n => (clIsClade(n) ? n.children.flatMap(clTaxaOf) : [n]);
/** Every node with a trait, the root first, each before those inside it (the order blank traits are numbered in). */
export function clWithTraits(n) { const own = n.trait && n.trait.trim() ? [n] : []; return clIsClade(n) ? [...own, ...n.children.flatMap(clWithTraits)] : own; }
/** Every clade, the root first, each before the clades inside it (the order nodes are numbered in). */
export const clCladesOf = n => (clIsClade(n) ? [n, ...n.children.flatMap(clCladesOf)] : []);
/** A clade with one member is just that member (its trait passes down if the member has none); one with none is nothing. */
export function clCollapse(n) {
  if (!clIsClade(n)) return n;
  const children = n.children.map(clCollapse).filter(Boolean);
  if (!children.length) return undefined;
  if (children.length === 1) { const only = children[0]; return (only.trait && only.trait.trim()) || !n.trait.trim() ? only : { ...only, trait: n.trait }; }
  return { trait: n.trait, children };
}
/** A ladder tree: traits[i] is shared by taxa[i] and every taxon after it, so traits[0] is on the root stem. */
export function clLadder(taxa, traits) {
  const build = i => (i === taxa.length - 1 ? clTaxon(taxa[i], traits[i] || undefined) : clClade(traits[i] || '', clTaxon(taxa[i]), build(i + 1)));
  return build(0);
}
/** The ready-made trees. */
export const CL_SETUPS = {
  vertebrates: () => clLadder(['Lancelet', 'Lamprey', 'Shark', 'Perch', 'Frog', 'Lizard', 'Mouse'], ['Notochord', 'Vertebrae', 'Jaws', 'Bony skeleton', 'Four limbs', 'Amniotic egg', 'Hair']),
  plants: () => clLadder(['Green algae', 'Mosses', 'Ferns', 'Conifers', 'Flowering plants'], ['', 'Embryos', 'Vascular tissue', 'Seeds', 'Flowers']),
  apes: () => clLadder(['Gibbon', 'Orangutan', 'Gorilla', 'Chimpanzee', 'Human'], []),
  letters: () => clClade('', clTaxon('A'), clClade('1', clClade('2', clTaxon('B'), clTaxon('C')), clClade('3', clTaxon('D'), clClade('4', clTaxon('E'), clTaxon('F'))))),
};

/** About how wide a line of Arial is. */
export const clTextWidth = (t, size) => 0.56 * size * [...t].length;
/** A name in lines no wider than `max`, broken at spaces. */
export function clWrap(t, size, max) {
  const lines = [];
  for (const word of t.trim().split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && clTextWidth(`${last} ${word}`, size) <= max) lines[lines.length - 1] = `${last} ${word}`; else lines.push(word);
  }
  return lines;
}
/** A blank trait's number, then its line. */
export const clBlankLabel = k => `${k}.`;
const clBlankW = k => clTextWidth(clBlankLabel(k), CL_TRAIT_SIZE) + 4 + CL_TRAIT_BLANK_W;
/** The traits drawn, in the order they are numbered. */
export const clShownTraits = s => (s.traits === 'none' ? [] : clWithTraits(s.tree));
const clTraitShown = (n, s) => s.traits !== 'none' && !!(n.trait && n.trait.trim());

function clPlace(tree, s, gap, step) {
  const at = new Map();
  let tip = 0;
  const height = n => (clIsClade(n) ? 1 + Math.max(...n.children.map(height)) : 0);
  const visit = n => {
    if (!clIsClade(n)) { const t = tip++ * gap; at.set(n, { t, d: 0 }); return { lo: t, hi: t }; }
    const spans = n.children.map(visit), lo = spans[0].lo, hi = spans[spans.length - 1].hi;
    if (s.style === 'diagonal') at.set(n, { t: (lo + hi) / 2, d: (hi - lo) / 2 });
    else { const first = at.get(n.children[0]), last = at.get(n.children[n.children.length - 1]); at.set(n, { t: (first.t + last.t) / 2, d: height(n) * step }); }
    return { lo, hi };
  };
  visit(tree);
  return at;
}
const clInside = (p, b) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
const clOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function clCrosses(p, q, b) {
  const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 2));
  for (let i = 0; i <= steps; i++) if (clInside({ x: p.x + ((q.x - p.x) * i) / steps, y: p.y + ((q.y - p.y) * i) / steps }, b)) return true;
  return false;
}
const clShrink = (b, by) => ({ x: b.x + by, y: b.y + by, w: b.w - 2 * by, h: b.h - 2 * by });
/** Does any trait label touch another label or a branch? */
export function clIsCrowded(at) {
  const boxes = at.traits.flatMap(t => (t.box ? [clShrink(t.box, -1)] : [])), names = at.names.map(n => n.box);
  return boxes.some((b, i) => boxes.some((o, j) => j > i && clOverlap(b, o)) || names.some(o => clOverlap(b, o)) || at.branches.some(line => line.slice(1).some((q, k) => clCrosses(line[k], q, b))));
}
/** The layout: { width, height, branches (polylines), names, traits, nodes, crowded }. s: { tree, style: "diagonal" |
 *  "rectangular", taxa: "names" | "blank", traits: "names" | "blank" | "ticks" | "none", nodeNumbers }. */
export function clLayout(s) {
  let at = clLayoutOnce(s, 0);
  for (let i = 1; i <= CL_MAX_SPREADS && at.crowded; i++) at = clLayoutOnce(s, i * CL_SPREAD);
  return at;
}
function clLayoutOnce(s, spread) {
  const tree = s.tree, taxa = clTaxaOf(tree), clades = clCladesOf(tree), top = s.style === 'diagonal';
  const numbers = new Map(clShownTraits(s).map((c, i) => [c, i + 1]));
  const nameLines = name => (s.taxa === 'blank' || !name.trim() ? [] : top ? clWrap(name, CL_NAME_SIZE, CL_NAME_WRAP) : [name.trim()]);
  const lineW = lines => (lines.length ? Math.max(...lines.map(l => clTextWidth(l, CL_NAME_SIZE))) : CL_NAME_BLANK_W);
  const traitW = c => (s.traits === 'names' ? clTextWidth((c.trait || '').trim(), CL_TRAIT_SIZE) : s.traits === 'blank' ? clBlankW(numbers.get(c) || 1) : 0);
  const widestTrait = Math.max(0, ...clShownTraits(s).map(traitW));
  const gap = spread + (top ? Math.max(CL_TOP_GAP, ...taxa.map(x => lineW(nameLines(x.name)) + 14)) : CL_RIGHT_GAP);
  const step = spread + Math.max(CL_MIN_STEP, widestTrait + 2 * CL_TEXT_GAP + 6);
  const at = clPlace(tree, s, gap, step), xy = (t, d) => (top ? { x: t, y: d } : { x: -d, y: t });
  const branches = [], traits = [], root = at.get(tree);
  const stem = clTraitShown(tree, s) ? (top ? CL_STEM + 14 : Math.max(CL_STEM, traitW(tree) + 2 * CL_TEXT_GAP + 6)) : CL_STEM;
  function trait(c, a, b) {
    if (!clTraitShown(c, s)) return;
    const mid = { t: (a.t + b.t) / 2, d: (a.d + b.d) / 2 }, len = Math.hypot(b.t - a.t, b.d - a.d) || 1;
    let n = { t: -(b.d - a.d) / len, d: (b.t - a.t) / len };
    if (n.d < 0 || (n.d === 0 && n.t < 0)) n = { t: -n.t, d: -n.d };
    const p1 = xy(mid.t - n.t * CL_TICK, mid.d - n.d * CL_TICK), p2 = xy(mid.t + n.t * CL_TICK, mid.d + n.d * CL_TICK);
    const label = s.traits === 'names' ? (c.trait || '').trim() : s.traits === 'blank' ? '' : null;
    if (label === null) { traits.push({ node: c, text: null, number: null, tick: [p1, p2], box: null }); return; }
    const w = traitW(c), h = CL_TRAIT_SIZE, o = xy(mid.t + n.t * (CL_TICK + CL_TEXT_GAP), mid.d + n.d * (CL_TICK + CL_TEXT_GAP)), dir = { x: p2.x - p1.x, y: p2.y - p1.y };
    const side = (v, size, start) => (Math.abs(v) < 1e-6 ? start - size / 2 : v > 0 ? start : start - size);
    let box;
    if (!top) { const m = xy(mid.t, mid.d); box = { x: m.x - w / 2, y: m.y - CL_TICK - CL_TEXT_GAP - h, w, h }; } else box = { x: side(dir.x, w, o.x), y: side(dir.y, h, o.y), w, h };
    traits.push({ node: c, text: label, number: label ? null : numbers.get(c) || null, tick: [p1, p2], box });
  }
  const stemEnd = { t: root.t, d: root.d + stem };
  branches.push([xy(root.t, root.d), xy(stemEnd.t, stemEnd.d)]);
  trait(tree, stemEnd, root);
  for (const c of clades) {
    const p = at.get(c);
    if (s.style === 'rectangular') { const first = at.get(c.children[0]), last = at.get(c.children[c.children.length - 1]); branches.push([xy(first.t, p.d), xy(last.t, p.d)]); }
    for (const child of c.children) { const q = at.get(child), from = s.style === 'rectangular' ? { t: q.t, d: p.d } : p; branches.push([xy(from.t, from.d), xy(q.t, q.d)]); trait(child, from, q); }
  }
  const names = taxa.map(x => {
    const p = xy(at.get(x).t, 0), lines = nameLines(x.name), w = lineW(lines);
    if (top) { const h = lines.length ? lines.length * CL_NAME_LINE : 4; return { node: x, lines, x: p.x, y: p.y - 8 - h, anchor: 'middle', box: { x: p.x - w / 2, y: p.y - 8 - h, w, h } }; }
    const h = lines.length ? CL_NAME_SIZE : 4;
    return { node: x, lines, x: p.x + 8, y: p.y - h / 2, anchor: 'start', box: { x: p.x + 8, y: p.y - h / 2, w, h } };
  });
  const nodes = s.nodeNumbers ? clades.map((c, i) => ({ ...xy(at.get(c).t, at.get(c).d), n: i + 1 })) : [];
  const xs = [], ys = [], add = b => { xs.push(b.x, b.x + b.w); ys.push(b.y, b.y + b.h); };
  for (const l of branches) for (const q of l) add({ x: q.x, y: q.y, w: 0, h: 0 });
  for (const tr of traits) { for (const q of tr.tick) add({ x: q.x, y: q.y, w: 0, h: 0 }); if (tr.box) add(tr.box); }
  for (const nm of names) add(nm.box);
  for (const nd of nodes) add({ x: nd.x - CL_NUMBER_R, y: nd.y - CL_NUMBER_R, w: 2 * CL_NUMBER_R, h: 2 * CL_NUMBER_R });
  const dx = CL_MARGIN - Math.min(...xs), dy = CL_MARGIN - Math.min(...ys), pt = q => ({ x: q.x + dx, y: q.y + dy }), bx = b => ({ ...b, x: b.x + dx, y: b.y + dy });
  return {
    crowded: clIsCrowded({ branches, names, traits }), width: Math.max(...xs) + dx + CL_MARGIN, height: Math.max(...ys) + dy + CL_MARGIN,
    branches: branches.map(l => l.map(pt)), names: names.map(nm => ({ ...nm, x: nm.x + dx, y: nm.y + dy, box: bx(nm.box) })),
    traits: traits.map(tr => ({ ...tr, tick: [pt(tr.tick[0]), pt(tr.tick[1])], box: tr.box && bx(tr.box) })), nodes: nodes.map(nd => ({ ...nd, ...pt(nd) })),
  };
}
