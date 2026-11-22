// Oomba Figures: genetics (1.3.0, the biology pack). A Punnett square for any cross from monohybrid to dihybrid and
// X-linked, with complete or incomplete dominance or codominance: the gametes along the top and side, every cell worked
// out, and the genotype and phenotype ratios computed from the cells (ported/punnett.js), never typed. A pedigree: a
// family as data (or a seeded random family for an inheritance mode), drawn in the standard notation, squares for males,
// circles for females, affected filled, carriers with a dot, a slash for the deceased, an arrow for the proband; a family
// given with a mode must be one that mode could give (ported/pedigree.js proves it by genotype elimination), and the
// genotypes written under each person are the ones the family proves. The checks, the answers (OF.solve) and the
// drawing are Oomba's own. Nothing is told by color alone: a filled symbol is filled black in print.
import { node, label, line, frame, palette, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { puId, puIsTop, puIsFemale, puCross, puSquare, puShown, puGenotypeCounts, puPhenotypeCounts, puReduced } from './ported/punnett.js';
import { PD_MODES, pdParse, pdFormat, pdEveryone, pdDepth, pdPossible, pdFitsMode, pdLikelihood, pdTells, pdGenotypeLabel, pdRandomFamily, PD_SIZE_NAMES, pdLayout, PD_SYMBOL, PD_MAX_GENERATIONS } from './ported/pedigree.js';

const genOdd = (d, keys, what) => { const k = Object.keys(d).find(x => !keys.includes(x)); return k ? [`${what} does not take "${k}"`] : []; };
/** Text with raised and lowered parts: runs [{ t, sup, sub }] -> one <text> with tspans. */
function rich(x, y, runs, o = {}) {
  const n = label(x, y, ' ', o); if (!n) return null;
  n.kids = [];
  for (const r of runs) {
    if (r.t) n.kids.push(String(r.t));
    if (r.sub) n.kids.push(node('tspan', { 'baseline-shift': 'sub', 'font-size': Math.round((o.size || 14) * 0.7) }, r.sub));
    if (r.sup) n.kids.push(node('tspan', { 'baseline-shift': 'super', 'font-size': Math.round((o.size || 14) * 0.7) }, r.sup));
    if (r.sub || r.sup) n.kids.push(node('tspan', { 'font-size': 2 }, ' '));
  }
  return n;
}
const alleleRuns = a => [{ t: a.base, sub: a.sub, sup: a.sup }];
const genotypeRuns = (g, spaced) => g.flatMap((gene, gi) => gene.flatMap((a, ai) => [...(spaced && (gi || ai) ? [{ t: ' ' }] : []), ...alleleRuns(a)]));
const runsWidth = (runs, size) => runs.reduce((w, r) => w + String(r.t || '').length * size * 0.62 + String(r.sub || '').length * size * 0.45 + String(r.sup || '').length * size * 0.45, 0);

// ---------------------------------------------------------------- the Punnett square
const PU_KEYS = ['kind', 'hide', 'parents', 'letters', 'cross', 'dominance', 'names', 'show', 'form', 'heading'];
const PU_CROSSES = ['monohybrid', 'dihybrid', 'x-linked'], PU_DOMINANCE = ['complete', 'incomplete', 'codominance'];
/** Each parent's allele tokens: as given, or from dominant-allele counts with "letters" ([1] with ["T"] is T, t). */
function puTokens(d) {
  if (!d.letters) return d.parents;
  return d.parents.map(p => p.flatMap((n, i) => { const L = d.letters[i].toUpperCase(), l = d.letters[i].toLowerCase(); return n === 2 ? [L, L] : n === 1 ? [L, l] : [l, l]; }));
}
const puCrossOf = d => d.cross || (puTokens(d)[0].length === 4 ? 'dihybrid' : 'monohybrid');
function puRead(d) {
  const t = puTokens(d);
  return puCross(t[0], t[1], puCrossOf(d), d.dominance || 'complete');
}
/** The phenotype classes a square shows, gene by gene, for writing a phenotype without a name: T_ (T hides t), tt, C^R C^W. */
function puClassRuns(sq, shown) {
  const every = sq.parents.flatMap(p => p.flat()).filter(a => a.chromosome !== 'Y');
  return shown.flatMap(alleles => {
    if (alleles.length !== 1) return alleles.flatMap(alleleRuns);
    const a = alleles[0], masks = every.some(low => !puIsTop(low) && puIsTop(a) && (sq.dominance === 'complete' || (a.chromosome === 'X' ? a.sup : a.base + a.sub + a.sup).toLowerCase() !== (low.chromosome === 'X' ? low.sup : low.base + low.sub + low.sup).toLowerCase()));
    if (masks) return [...alleleRuns(a), { t: '_' }];
    return sq.cross === 'x-linked' ? alleleRuns(a) : [...alleleRuns(a), ...alleleRuns(a)];
  });
}
const puKeyOf = shown => shown.map(g => g.map(puId).join('+')).join(' ');
/**
 * { parents: [["T", "t"], ["t", "t"]] (allele tokens: T, t; C^R, C^W; I^A, I^B, i; R_1, R_2; on an X-linked cross X^H,
 * X^h, Y; a dihybrid parent four, ["R", "r", "Y", "y"]), or letters: ["R", "Y"] with parents [[1, 1], [2, 0]] (each
 * gene's dominant alleles: 2, 1 or 0); cross: "monohybrid" | "dihybrid" | "x-linked" (from the parents if left out, but
 * X-linked is always said), dominance: "complete" | "incomplete" | "codominance", names: { "T": "tall", "t": "short",
 * "C^R+C^W": "pink" } (a phenotype's name by the alleles it shows), show: ["genotype", "phenotype"], form: "ratio" |
 * "percent" | "fraction", heading }. hide: "cells", "gametes", "ratios", true (cells and ratios).
 */
export const punnett = {
  check(d) {
    const out = genOdd(d, PU_KEYS, 'a Punnett square');
    if (out.length) return out;
    if (!Array.isArray(d.parents) || d.parents.length !== 2 || d.parents.some(p => !Array.isArray(p))) return ['"parents" lists the two parents, each a list of alleles like ["T", "t"]'];
    if (d.letters !== undefined) {
      if (!Array.isArray(d.letters) || !d.letters.length || d.letters.length > 2 || d.letters.some(l => typeof l !== 'string' || !/^[A-Za-z]$/.test(l)) || new Set(d.letters.map(l => l.toLowerCase())).size !== d.letters.length) return ['"letters" lists one or two genes\' letters, like ["T"] or ["R", "Y"]'];
      if (d.parents.some(p => p.length !== d.letters.length || p.some(n => ![0, 1, 2].includes(n)))) return ['with "letters", each parent gives each gene\'s dominant alleles: 0, 1 or 2'];
      if (d.cross === 'x-linked' || (d.dominance && d.dominance !== 'complete')) return ['"letters" is for complete dominance, monohybrid or dihybrid'];
    } else if (d.parents.some(p => !p.length || p.length > 4 || p.some(a => typeof a !== 'string' || a.length > 10))) return ['each parent is a list of 2 to 4 allele tokens'];
    if (d.cross !== undefined && !PU_CROSSES.includes(d.cross)) return [`"cross" must be one of ${PU_CROSSES.join(', ')}`];
    if (d.dominance !== undefined && !PU_DOMINANCE.includes(d.dominance)) return [`"dominance" must be one of ${PU_DOMINANCE.join(', ')}`];
    if (d.cross === 'dihybrid' && d.dominance && d.dominance !== 'complete') return ['a dihybrid square here is two genes with complete dominance'];
    const r = puRead(d);
    if (r.error) return [r.error];
    if (d.names !== undefined && (!d.names || typeof d.names !== 'object' || Array.isArray(d.names) || Object.values(d.names).some(v => !text(v, 20)))) out.push('"names" maps a phenotype (its alleles: "T", "t", "C^R+C^W") to a short name');
    if (d.show !== undefined && (!Array.isArray(d.show) || d.show.some(s => !['genotype', 'phenotype'].includes(s)))) out.push('"show" lists "genotype" and/or "phenotype"');
    if (d.form !== undefined && !['ratio', 'percent', 'fraction'].includes(d.form)) out.push('"form" must be "ratio", "percent" or "fraction"');
    return out;
  },
  /** The square's numbers: each genotype's and phenotype's count and percent, the ratios in lowest terms, the share
   *  with the recessive phenotype (every gene), and for an X-linked cross the daughters' and sons' phenotypes. */
  solve(d) {
    if (punnett.check(d).length) return null;
    const sq = puSquare(puRead(d)), cells = sq.cells.flat(), n = cells.length, gc = puGenotypeCounts(sq), pc = puPhenotypeCounts(sq);
    const pct = c => Math.round((c / n) * 1e6) / 1e4, obj = (list, f) => Object.fromEntries(list.map(t => [t.key, f(t)]));
    const rec = cells.filter(g => g.every(gene => puShown(gene, sq.dominance).every(a => !puIsTop(a)))).length;
    const out = { cross: sq.cross, dominance: sq.dominance, cells: n, top: sq.top.map(g => g.map(puId).join('')), side: sq.side.map(g => g.map(puId).join('')),
      genotypes: obj(gc, t => t.count), phenotypes: obj(pc, t => t.count), genotypePercent: obj(gc, t => pct(t.count)), phenotypePercent: obj(pc, t => pct(t.count)),
      genotypeRatio: puReduced(gc.map(t => t.count)).join(' : '), phenotypeRatio: puReduced(pc.map(t => t.count)).join(' : '), recessivePercent: pct(rec), dominantPercent: sq.dominance === 'complete' && sq.cross !== 'x-linked' ? pct(cells.filter(g => g.every(gene => puShown(gene, sq.dominance).some(puIsTop))).length) : null };
    if (sq.cross === 'x-linked') {
      const girls = cells.filter(puIsFemale), boys = cells.filter(g => !puIsFemale(g));
      out.daughters = obj(puPhenotypeCounts(sq, girls), t => t.count); out.sons = obj(puPhenotypeCounts(sq, boys), t => t.count);
      out.daughterPercent = obj(puPhenotypeCounts(sq, girls), t => Math.round((t.count / girls.length) * 1e6) / 1e4); out.sonPercent = obj(puPhenotypeCounts(sq, boys), t => Math.round((t.count / boys.length) * 1e6) / 1e4);
    }
    return out;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), sq = puSquare(puRead(d)), spaced = sq.cross === 'x-linked' || sq.parents.some(p => p.flat().some(a => a.sup || a.sub));
    const n = sq.top.length, m = sq.side.length, cell = n > 2 ? 62 : 78, size = n > 2 ? 15 : 19, x0 = 96, y0 = 76, kids = [];
    const hideCells = o.hide === true || hides(o, 'cells'), hideGam = hides(o, 'gametes'), hideRatios = o.hide === true || hides(o, 'ratios');
    // the parents: the first across the top, the second down the side
    kids.push(rich(x0 + (n * cell) / 2, 18, genotypeRuns(sq.parents[0], spaced), { anchor: 'middle', size: 16, colour: P.ink2, cls: 'of-parent' }));
    const sideP = rich(0, 0, genotypeRuns(sq.parents[1], spaced), { anchor: 'middle', size: 16, colour: P.ink2, cls: 'of-parent' });
    kids.push(node('g', { transform: `translate(20 ${r2(y0 + (m * cell) / 2)}) rotate(-90)` }, sideP));
    // the gametes, in their own header boxes
    sq.top.forEach((g, i) => { kids.push(node('rect', { x: x0 + i * cell, y: y0 - 38, width: cell, height: 34, fill: P.soft, stroke: P.ink, 'stroke-width': 1.2 })); if (!hideGam) kids.push(rich(x0 + i * cell + cell / 2, y0 - 21, g.flatMap(alleleRuns), { anchor: 'middle', size, colour: P.blue, cls: 'of-gamete' })); });
    sq.side.forEach((g, j) => { kids.push(node('rect', { x: x0 - 52, y: y0 + j * cell, width: 48, height: cell, fill: P.soft, stroke: P.ink, 'stroke-width': 1.2 })); if (!hideGam) kids.push(rich(x0 - 28, y0 + j * cell + cell / 2, g.flatMap(alleleRuns), { anchor: 'middle', size, colour: P.blue, cls: 'of-gamete' })); });
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
      kids.push(node('rect', { x: x0 + i * cell, y: y0 + j * cell, width: cell, height: cell, fill: P.paper, stroke: P.ink, 'stroke-width': 1.6, class: 'of-cell' }));
      if (!hideCells) kids.push(rich(x0 + i * cell + cell / 2, y0 + j * cell + cell / 2, genotypeRuns(sq.cells[j][i], spaced), { anchor: 'middle', size, colour: P.ink, cls: 'of-offspring' }));
    }
    // the ratios, computed from the cells
    const form = d.form || 'ratio', show = d.show || ['genotype', 'phenotype'], names = d.names || {};
    const lineOf = (tallies, runsOf) => {
      const total = tallies.reduce((s, t) => s + t.count, 0), counts = puReduced(tallies.map(t => t.count)), g = x => { let a = x, b = total; while (b) [a, b] = [b, a % b]; return a; };
      if (tallies.length === 1) return [{ t: form === 'percent' ? '100% ' : `${W('all')} ` }, ...runsOf(tallies[0])];
      return tallies.flatMap((t, i) => [{ t: `${form === 'ratio' ? counts[i] : form === 'percent' ? `${Math.round((t.count / total) * 10000) / 100}%` : `${t.count / g(t.count)}/${total / g(t.count)}`} ` }, ...runsOf(t), ...(i < tallies.length - 1 ? [{ t: form === 'ratio' ? ' : ' : ', ' }] : [])]);
    };
    const phRuns = t => { const nm = names[puKeyOf(t.value)]; return nm ? [{ t: text(nm, 20) }] : puClassRuns(sq, t.value); };
    const rows = [];
    if (show.includes('genotype')) rows.push([`${W(form === 'ratio' ? 'genotypeRatio' : 'genotypes')}:`, lineOf(puGenotypeCounts(sq), t => genotypeRuns(t.value, spaced))]);
    if (show.includes('phenotype')) {
      if (sq.cross === 'x-linked') { const all = sq.cells.flat(); rows.push([`${W('daughters')}:`, lineOf(puPhenotypeCounts(sq, all.filter(puIsFemale)), phRuns)], [`${W('sons')}:`, lineOf(puPhenotypeCounts(sq, all.filter(g => !puIsFemale(g))), phRuns)]); }
      else rows.push([`${W(form === 'ratio' ? 'phenotypeRatio' : 'phenotypes')}:`, lineOf(puPhenotypeCounts(sq), phRuns)]);
    }
    let y = y0 + m * cell + 30, w = x0 + n * cell + 20;
    for (const [head, runs] of rows) {
      kids.push(label(16, y, head, { size: 14, weight: 800, colour: P.ink, cls: 'of-ratio-head' }));
      const hx = 16 + head.length * 8.4 + 8;
      if (hideRatios) kids.push(line(hx, y + 6, hx + 220, y + 6, P.ink, 1.2, { class: 'of-blank' }));
      else kids.push(rich(hx, y, runs, { size: 14, weight: 600, colour: P.ink, cls: 'of-ratio' }));
      w = Math.max(w, hx + (hideRatios ? 230 : runsWidth(runs, 14) + 16)); y += 26;
    }
    if (d.heading) { kids.push(label(w / 2, 14, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink })); }
    return frame(w, y - 6, kids, { ...o, kind: 'punnett' }, o.title || W('punnett'));
  },
};

// ---------------------------------------------------------------- the pedigree
const PD_KEYS = ['kind', 'hide', 'mode', 'family', 'seed', 'generations', 'size', 'carriers', 'numbers', 'numerals', 'genotypes', 'letter', 'heading'];
const pdMode = d => (typeof d.mode === 'number' ? PD_MODES[d.mode] : d.mode);
/** The family drawn: the one given, or a seeded random one for the mode (carriers kept only when they are shown). */
function pdFamily(d) {
  if (d.family !== undefined) return pdParse(d.family);
  const f = pdRandomFamily(pdMode(d), d.generations ?? 3, d.size || 'medium', d.seed);
  if (!d.carriers) { const strip = m => { m.carrier = false; if (m.partner) m.partner.carrier = false; m.children.forEach(strip); }; strip(f); }
  return f;
}
const PD_CACHE = new Map();
function pdCached(d) {
  const k = JSON.stringify([d.family, d.seed, d.generations, d.size, pdMode(d), !!d.carriers]);
  if (!PD_CACHE.has(k)) { if (PD_CACHE.size > 64) PD_CACHE.clear(); PD_CACHE.set(k, pdFamily(d)); }
  return PD_CACHE.get(k);
}
/**
 * { family: "m-F3fcMm-f2mfd" (each person's sex m, f or u, upper case when affected, then marks c carrier, d deceased,
 * p proband, t or i a fraternal or identical twin of the next child; "-" or "." (a relative) and the partner, then how
 * many children and each child the same way), or seed with generations (2 to 4) and size ("small", "medium", "large"):
 * a random family for the mode; mode: "ad" | "ar" | "xr" | "xd" | "y" (or its place in that list, 0 to 4); carriers
 * (draw carriers, a dot), numbers (II-3 under each), numerals (true: I, II, III at the left), genotypes (what the family
 * proves about each, from the mode), letter ("A"), heading }. A family given with a mode must be one that mode could
 * give. hide: "genotypes" (blank lines to fill in), "affected" (every symbol empty, to shade), true (both).
 */
export const pedigree = {
  check(d) {
    const out = genOdd(d, PD_KEYS, 'a pedigree');
    if (out.length) return out;
    const mode = pdMode(d);
    if (d.mode !== undefined && !PD_MODES.includes(mode)) return ['"mode" must be "ad", "ar", "xr", "xd" or "y" (or 0 to 4)'];
    if ((d.family === undefined) === (d.seed === undefined)) return ['give "family" (the family as one line) or "seed" (a random family for the mode), one of them'];
    if (d.seed !== undefined) {
      if (!Number.isInteger(d.seed) || d.seed < 0 || d.seed > 1e9) return ['"seed" must be a whole number'];
      if (!mode) return ['a random family needs its "mode"'];
      if (d.generations !== undefined && !(Number.isInteger(d.generations) && d.generations >= 2 && d.generations <= PD_MAX_GENERATIONS)) return ['"generations" must be 2, 3 or 4'];
      if (d.size !== undefined && !PD_SIZE_NAMES.includes(d.size)) return ['"size" must be "small", "medium" or "large"'];
    } else {
      if (typeof d.family !== 'string' || d.family.length > 160 || !pdParse(d.family)) return ['"family" must be a family in one line, like "m-F3fcMm-f2mfd" (at most 4 generations, 9 children a couple)'];
      if (d.generations !== undefined || d.size !== undefined) return ['"generations" and "size" are for a random family (with "seed")'];
    }
    for (const b of ['carriers', 'numbers', 'numerals', 'genotypes']) if (d[b] !== undefined && typeof d[b] !== 'boolean') out.push(`"${b}" must be true or false`);
    if (d.letter !== undefined && !(typeof d.letter === 'string' && /^[A-Za-z]$/.test(d.letter))) out.push('"letter" is the allele\'s one letter');
    if (d.genotypes && !mode) out.push('the genotypes come from the mode: give "mode"');
    if (out.length) return out;
    if (d.family !== undefined && mode) {
      const root = pdParse(d.family), sets = pdPossible(root, mode, !!d.carriers);
      if (!sets) out.push(`for ${mode === 'ad' || mode === 'ar' ? 'this mode' : 'a sex-linked mode'} every couple with children must be a man and a woman`);
      else {
        const L = pdLayout(root, { numerals: true }), names = new Map(L.people.map(p => [p.key, p.name])), none = [...sets].filter(([, s]) => !s.length).map(([k]) => names.get(k));
        if (none.length) out.push(`this family cannot be ${mode} inheritance${d.carriers ? ' with these carriers' : ''}: ${none.slice(0, 4).join(', ')} fit${none.length === 1 ? 's' : ''} no genotype`);
        else if (!d.carriers && pdEveryone(root).some(p => p.person.carrier)) out.push('the family marks carriers: draw them with "carriers": true, or leave the marks out');
      }
    }
    return out;
  },
  /** The family's numbers: people, affected, carriers, generations; which modes it fits, whether students can tell its
   *  mode, the likeliest mode (and its place, modeIndex), and each person's genotype as far as the family proves it. */
  solve(d) {
    if (pedigree.check(d).length) return null;
    const root = pdCached(d), mode = pdMode(d), carriers = !!d.carriers, all = pdEveryone(root).map(p => p.person);
    const fits = Object.fromEntries(PD_MODES.map(m => [m, pdFitsMode(root, m, carriers)])), lik = Object.fromEntries(PD_MODES.map(m => [m, pdLikelihood(root, m, carriers)]));
    const best = PD_MODES.reduce((a, m) => (lik[m] > lik[a] ? m : a), PD_MODES[0]);
    const out = { family: pdFormat(root), people: all.length, affected: all.filter(p => p.affected).length, carriers: all.filter(p => p.carrier).length, generations: pdDepth(root), fits, fitting: PD_MODES.filter(m => fits[m]).length, likeliest: best };
    if (mode) {
      out.mode = mode; out.modeIndex = PD_MODES.indexOf(mode); out.modeNumber = out.modeIndex + 1; out.tells = pdTells(root, mode, carriers);
      const sets = pdPossible(root, mode, carriers), L = pdLayout(root, { numerals: true }), letter = d.letter || 'A';
      out.genotypes = Object.fromEntries(L.people.map(p => { const lab = pdGenotypeLabel(mode, sets.get(p.key), letter); return [p.name, lab ? lab.map(a => (a.sup ? `${a.text}^${a.sup}` : a.text)).join('') : null]; }));
    }
    return out;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), root = pdCached(d), mode = pdMode(d), letter = d.letter || 'A';
    const hideG = o.hide === true || hides(o, 'genotypes'), hideA = o.hide === true || hides(o, 'affected'), rows = (d.numbers ? 1 : 0) + (d.genotypes ? 1 : 0);
    const L = pdLayout(root, { numerals: d.numerals !== false, rows, labelWidth: d.genotypes ? 58 : 0 }), head = d.heading ? 26 : 0, kids = [], s = PD_SYMBOL / 2;
    const sets = d.genotypes ? pdPossible(root, mode, !!d.carriers) : null;
    for (const l of L.lines) kids.push(line(r2(l.x1), r2(l.y1 + head), r2(l.x2), r2(l.y2 + head), P.ink, 2));
    for (const n of L.numerals) kids.push(label(8, n.y + head, n.text, { size: 17, weight: 800, colour: P.ink, cls: 'of-numeral' }));
    for (const p of L.people) {
      const x = p.x, y = p.y + head, who = p.person, fill = who.affected && !hideA ? P.ink : P.paper, attrs = { fill, stroke: P.ink, 'stroke-width': 2, class: `of-person${who.affected && !hideA ? ' of-affected' : ''}` };
      if (who.sex === 'm') kids.push(node('rect', { x: x - s, y: y - s, width: 2 * s, height: 2 * s, ...attrs }));
      else if (who.sex === 'f') kids.push(node('circle', { cx: x, cy: y, r: s, ...attrs }));
      else kids.push(node('polygon', { points: `${x},${y - s - 2} ${x + s + 2},${y} ${x},${y + s + 2} ${x - s - 2},${y}`, ...attrs }));
      if (d.carriers && who.carrier && !hideA) kids.push(node('circle', { cx: x, cy: y, r: 5, fill: P.ink, class: 'of-carrier' }));
      if (who.deceased) kids.push(line(x - s - 6, y + s + 6, x + s + 6, y - s - 6, P.ink, 2, { class: 'of-deceased' }));
      if (who.proband) kids.push(line(x - s - 20, y + s + 14, x - s - 4, y + s - 2, P.ink, 2), node('polygon', { points: `${x - s - 2},${y + s - 4} ${x - s - 12},${y + s - 2} ${x - s - 6},${y + s + 6}`, fill: P.ink, class: 'of-proband' }));
      let ly = y + s + 4 + 13;
      if (d.numbers) { kids.push(label(x, ly, p.name.split('-')[1], { anchor: 'middle', size: 13, weight: 600, colour: P.ink2, cls: 'of-number' })); ly += 18; }
      if (d.genotypes) {
        const lab = sets && pdGenotypeLabel(mode, sets.get(p.key), letter);
        if (hideG || !lab) kids.push(line(x - 20, ly + 5, x + 20, ly + 5, P.ink, 1.2, { class: 'of-blank' }));
        else kids.push(rich(x, ly, lab.map(a => ({ t: a.text, sup: a.sup })), { anchor: 'middle', size: 15, colour: P.blue, cls: 'of-genotype' }));
      }
    }
    if (d.heading) kids.push(label(L.width / 2, 14, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }));
    return frame(Math.max(L.width + 8, 200), L.height + head + 12, kids, { ...o, kind: 'pedigree' }, o.title || W('pedigree'));
  },
};
export const GENETICS_KINDS = { punnett, pedigree };
