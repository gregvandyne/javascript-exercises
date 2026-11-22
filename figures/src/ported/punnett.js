// Oomba Figures: the genetics behind a Punnett square, monohybrid to dihybrid and X-linked: the gametes each parent
// makes, the offspring in each cell, and the genotype and phenotype counts they add up to. Alleles are written the usual
// classroom way. With complete dominance a capital letter is dominant and its small letter recessive (T, t). With
// incomplete dominance or codominance alleles carry superscripts (C^R, C^W) or subscripts (R_1, R_2), and a small
// letter without one is recessive to them (i in I^A, I^B, i). An X-linked allele is the superscript on its X (X^H, X^h);
// Y carries none. A gamete takes one allele of each gene (AaBb: AB, Ab, aB, ab); a cell is a top gamete with a side
// gamete, each gene's alleles in the standard order (dominant first). A heterozygote shows only the dominant allele with
// complete dominance, or when the alleles are different letters (I^A hides i); the same letter in two forms blends (R
// and r, pink). Ratios are counts in lowest terms. Pure data in, pure data out: figures/src/genetics.js checks the data
// and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; a parent is a list of allele tokens (structured data) instead of typed
// text, so the text reading, the forgiving of typed order and separators and the pasted superscripts are left out, as
// are the summary text runs, the phenotype naming and the layout (Oomba draws the square and its ratios its own way).

/** One allele token ("T", "C^R", "R_1", "I^{AB}", "X^H", "Y") -> { base, sub, sup, chromosome? }, or null. */
export function puAllele(token, xLinked) {
  const s = String(token || '');
  const m = /^([A-Za-z])((?:_(?:[A-Za-z0-9+]|\{[A-Za-z0-9+]{1,4}\})|\^(?:[A-Za-z0-9+]|\{[A-Za-z0-9+]{1,4}\})){0,2})$/.exec(s);
  if (!m) return null;
  const a = { base: m[1], sub: '', sup: '' };
  for (const p of m[2].match(/[_^](?:\{[^}]+\}|.)/g) || []) {
    const v = p[1] === '{' ? p.slice(2, -1) : p.slice(1);
    if (p[0] === '_') { if (a.sub) return null; a.sub = v; } else { if (a.sup) return null; a.sup = v; }
  }
  if (xLinked) { if (a.base !== 'X' && a.base !== 'Y') return null; a.chromosome = a.base; }
  return a;
}
const puScript = (mark, t) => (t ? (t.length > 1 ? `${mark}{${t}}` : mark + t) : '');
/** The allele as a token: T, C^R, X^H, R_1. */
export const puId = a => a.base + puScript('_', a.sub) + puScript('^', a.sup);
const puIsY = a => a.chromosome === 'Y';
const puUpper = c => c !== c.toLowerCase() || /^\d/.test(c);
/** Dominant (top) alleles are capitals: T, C^R, I^A, and on an X, X^H. */
export const puIsTop = a => (a.chromosome === 'X' ? puUpper(a.sup) : !puIsY(a) && puUpper(a.base));
const puLetters = a => (a.chromosome === 'X' ? a.sup : a.base + a.sub + a.sup);
const puRank = a => (puIsY(a) ? '2' : (puIsTop(a) ? '0' : '1') + a.sup.toLowerCase() + a.sup + a.sub + a.base);
export const puSort = list => [...list].sort((a, b) => (puRank(a) < puRank(b) ? -1 : puRank(a) > puRank(b) ? 1 : 0));
const puSame = (a, b) => a.base === b.base && a.sub === b.sub && a.sup === b.sup && a.chromosome === b.chromosome;
export const puIsFemale = g => !g.some(gene => gene.some(puIsY));
const puGeneOf = (a, xLinked) => (xLinked ? 'X' : a.base.toLowerCase());

/** One parent (a list of tokens) -> { genotype: [[allele, allele], ...] } or { error }. order: the first parent's genes. */
export function puParent(tokens, cross, dominance, order) {
  const xl = cross === 'x-linked', alleles = tokens.map(t => puAllele(t, xl));
  const bad = tokens.find((t, i) => !alleles[i]);
  if (bad !== undefined) return { error: xl ? `"${String(bad).slice(0, 12)}" is not an X or Y allele (X^H, X^h, Y)` : `"${String(bad).slice(0, 12)}" is not an allele (T, t, C^R, I^A, R_1)` };
  if (xl) {
    const xs = alleles.filter(a => a.chromosome === 'X'), ys = alleles.filter(puIsY);
    if (ys.some(a => a.sup || a.sub)) return { error: 'a Y chromosome carries no allele, so it has no superscript' };
    if (alleles.some(a => a.sub)) return { error: 'write each X\'s allele as its superscript, like X^H' };
    if (xs.some(a => !a.sup)) return { error: 'give each X its allele as a superscript, like X^H or X^h' };
    if (xs.length + ys.length !== 2 || ys.length > 1) return { error: 'a mother has two X chromosomes (X^H, X^h) and a father an X and a Y (X^H, Y)' };
    return { genotype: [puSort(alleles)] };
  }
  if (dominance === 'complete' && alleles.some(a => a.sup || a.sub)) return { error: 'superscripts and subscripts are for incomplete dominance and codominance: with complete dominance, use letters like T and t' };
  const genes = new Map();
  for (const a of alleles) genes.set(puGeneOf(a, xl), [...(genes.get(puGeneOf(a, xl)) || []), a]);
  const wanted = cross === 'dihybrid' ? 2 : 1;
  if (genes.size !== wanted) return { error: `each parent needs ${wanted === 1 ? 'one gene, like ["T", "t"]' : 'two genes, like ["R", "r", "Y", "y"]'}` };
  for (const g of genes.values()) if (g.length !== 2) return { error: `each gene has two alleles (${g.map(puId).join(', ')} is ${g.length})` };
  const keys = order || [...genes.keys()];
  if (keys.length !== genes.size || keys.some(k => !genes.has(k))) return { error: 'both parents need the same genes' };
  return { genotype: keys.map(k => puSort(genes.get(k))) };
}
/** Both parents -> { cross, dominance, parents } or { error }. With complete dominance each gene has its two letters only. */
export function puCross(p1, p2, cross, dominance) {
  if (cross === 'dihybrid') dominance = 'complete';
  const first = puParent(p1, cross, dominance);
  if (first.error) return { error: `parent 1: ${first.error}` };
  const order = cross === 'x-linked' ? undefined : first.genotype.map(gene => puGeneOf(gene[0], false));
  const second = puParent(p2, cross, dominance, order);
  if (second.error) return { error: `parent 2: ${second.error}` };
  const parents = [first.genotype, second.genotype];
  if (cross === 'x-linked' && puIsFemale(parents[0]) === puIsFemale(parents[1])) return { error: 'an X-linked cross needs a mother (two X chromosomes) and a father (an X and a Y)' };
  if (dominance === 'complete') {
    for (let g = 0; g < parents[0].length; g++) {
      const kinds = new Set(parents.flatMap(p => p[g]).filter(x => !puIsY(x)).map(x => puLetters(x).toLowerCase()));
      if (kinds.size > 1) return { error: 'with complete dominance a gene\'s alleles share one letter (T and t): for more, use incomplete dominance or codominance' };
    }
  }
  return { cross, dominance, parents };
}
/** Each gamete a parent makes, one allele from each gene (first with first, first with last, and so on). */
export const puGametes = g => g.reduce((made, gene) => made.flatMap(gamete => gene.map(a => [...gamete, a])), [[]]);
export const puOffspring = (a, b) => a.map((allele, i) => puSort([allele, b[i]]));
/** The square: top gametes (the first parent's), side gametes (the second's), cells[row][column]. */
export function puSquare(p) {
  const top = puGametes(p.parents[0]), side = puGametes(p.parents[1]);
  return { ...p, top, side, cells: side.map(s => top.map(t => puOffspring(t, s))) };
}
function puHides(top, low, dominance) {
  if (!puIsTop(top) || puIsTop(low) || puIsY(low)) return false;
  return dominance === 'complete' || puLetters(top).toLowerCase() !== puLetters(low).toLowerCase();
}
/** The alleles a gene's phenotype shows: T for TT and Tt; C^R and C^W together (blended or both shown); Y shows nothing. */
export function puShown(gene, dominance) {
  const distinct = puSort(gene.filter(a => !puIsY(a))).filter((a, i, all) => i === all.findIndex(b => puSame(a, b)));
  return distinct.filter(low => !distinct.some(top => puHides(top, low, dominance)));
}
export const puPhenotypeKey = (g, dominance) => g.map(gene => puShown(gene, dominance).map(puId).join('+')).join(' ');
export const puGenotypeKey = g => g.map(gene => gene.map(puId).join('')).join('');
function puRanks(sq) {
  const all = puSort(sq.parents.flat(2)).filter((a, i, list) => i === list.findIndex(b => puSame(a, b)));
  return a => all.findIndex(b => puSame(a, b));
}
const puCompare = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };
/** How many cells hold each genotype: homozygous dominant, heterozygous, homozygous recessive; daughters before sons. */
export function puGenotypeCounts(sq, cells = sq.cells.flat()) {
  const rank = puRanks(sq), tallies = new Map();
  for (const g of cells) { const key = puGenotypeKey(g), t = tallies.get(key) || { key, value: g, count: 0 }; t.count++; tallies.set(key, t); }
  const order = g => [puIsFemale(g) ? 0 : 1, ...g.flat().map(rank)];
  return [...tallies.values()].sort((a, b) => puCompare(order(a.value), order(b.value)));
}
/** How many cells show each phenotype, dominant first (9 : 3 : 3 : 1). */
export function puPhenotypeCounts(sq, cells = sq.cells.flat()) {
  const rank = puRanks(sq), tallies = new Map();
  for (const g of cells) {
    const key = puPhenotypeKey(g, sq.dominance), t = tallies.get(key) || { key, value: g.map(gene => puShown(gene, sq.dominance)), count: 0 };
    t.count++; tallies.set(key, t);
  }
  const order = v => v.flatMap(gene => [...gene.map(rank), -1]);
  return [...tallies.values()].sort((a, b) => puCompare(order(a.value), order(b.value)));
}
const puGcd = (a, b) => (b ? puGcd(b, a % b) : a);
/** Counts in lowest terms: 2 : 2 is 1 : 1, 9 : 3 : 3 : 1 stays. */
export function puReduced(counts) { const d = counts.reduce(puGcd, 0) || 1; return counts.map(c => c / d); }
