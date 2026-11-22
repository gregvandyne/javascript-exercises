// Oomba Figures: a pedigree, for one gene with two alleles, fully penetrant, and no new mutations: the textbook model
// (OpenStax Biology 2e, chapters 12 and 13). The family is a tree: the founder in generation I and everyone descended
// from them, each with at most one partner who married in, and their children in birth order. It is written as one
// short line: each person's sex (m, f, u), upper case when affected, then their marks (c carrier, d deceased, p proband,
// t a fraternal twin of the next child, i an identical twin), then "-" and their partner (or "." for a partner who is a
// relative) and how many children they have, then those children the same way ("m-F3fcMm-f2mfd"). A genotype is the
// person's sex and how many copies of the trait's allele they have ("a1" an autosomal heterozygote, "f1" a woman with
// one trait X, "m1" a man with a trait X or Y). From everyone's drawn phenotype the genotypes each could have are worked
// out (genotype elimination, exact for a family drawn as a tree); a family fits a mode when everyone keeps at least one.
// Its likelihood under a mode adds up every way the genes could have been passed down, the trait's allele rare (1%)
// among people who married in; students can tell the mode when it fits and every other mode is ruled out or at least
// ten times less likely. A random family for a mode is given real genotypes, passed down by Mendel's rules from a
// founding couple that carries the trait, so it always fits its mode; of the families tried (from a seed, mulberry32),
// the first a student could diagnose is kept. The layout follows the standard pedigree nomenclature (Bennett et al.,
// NSGC 2008 and 2022): a generation to a row, partners side by side, a line of descent to the sibship line, twins from
// one point, each family placed beside its siblings' as close as their rows allow, so lines never cross. Pure data in,
// pure data out: figures/src/genetics.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the editing by hand, re-shading a drawn family, the classic families, the
// clues, the settings and the label widths are left out (Oomba checks the family and draws its own symbols and labels).

export const PD_MODES = ['ad', 'ar', 'xr', 'xd', 'y'];
export const PD_MAX_GENERATIONS = 4, PD_MAX_CHILDREN = 9;
const pdPerson = (sex, over = {}) => ({ sex, affected: false, carrier: false, deceased: false, proband: false, ...over });
export const pdRefKey = ref => `${ref.path.join('.')}${ref.partner ? 'p' : ''}`;
export const pdDepth = m => 1 + Math.max(0, ...m.children.map(pdDepth));
function pdMemberAt(root, path) { let at = root; for (const i of path) at = at && at.children[i]; return at; }
/** Every person: blood relatives down the tree, each one's partner after them. */
export function pdEveryone(root, path = [], out = []) {
  const m = pdMemberAt(root, path);
  out.push({ ref: { path, partner: false }, person: m, generation: path.length });
  if (m.partner) out.push({ ref: { path, partner: true }, person: m.partner, generation: path.length });
  for (let i = 0; i < m.children.length; i++) pdEveryone(root, [...path, i], out);
  return out;
}
/** The family in its one-line form -> the tree, or null when it is not one (more than four generations, nine children). */
export function pdParse(text) {
  text = String(text || '');
  let i = 0;
  const readPerson = () => {
    const c = text[i], sex = c && { m: 'm', f: 'f', u: 'u' }[c.toLowerCase()];
    if (!sex) return null;
    i++;
    const p = pdPerson(sex, { affected: c !== c.toLowerCase() });
    for (;;) {
      const mark = text[i];
      if (mark === 'c') p.carrier = true; else if (mark === 'd') p.deceased = true; else if (mark === 'p') p.proband = true;
      else if (mark === 't') p.twin = 'dz'; else if (mark === 'i') p.twin = 'mz'; else break;
      i++;
    }
    return p;
  };
  const readMember = depth => {
    if (depth > PD_MAX_GENERATIONS) return null;
    const p = readPerson(); if (!p) return null;
    const m = { ...p, children: [] };
    if (!p.twin) delete m.twin;
    if (text[i] === '-' || text[i] === '.') {
      m.consanguineous = text[i] === '.'; i++;
      const partner = readPerson(); if (!partner) return null;
      delete partner.twin; m.partner = partner;
      if (!m.consanguineous) delete m.consanguineous;
      if (/[1-9]/.test(text[i] || '')) { const n = Number(text[i++]); for (let k = 0; k < n; k++) { const c = readMember(depth + 1); if (!c) return null; m.children.push(c); } }
    }
    return m;
  };
  const root = readMember(1);
  return root && i === text.length ? root : null;
}
const pdFormatPerson = (p, twin) => (p.affected ? p.sex.toUpperCase() : p.sex) + (p.carrier ? 'c' : '') + (p.deceased ? 'd' : '') + (p.proband ? 'p' : '') + (twin === 'dz' ? 't' : twin === 'mz' ? 'i' : '');
/** The tree back in its one-line form. */
export function pdFormat(m) {
  let out = pdFormatPerson(m, m.twin);
  if (m.partner) { out += (m.consanguineous ? '.' : '-') + pdFormatPerson(m.partner); if (m.children.length) out += m.children.length + m.children.map(pdFormat).join(''); }
  return out;
}

// ---------------------------------------------------------------- the genetics
const pdAutosomal = mode => mode === 'ad' || mode === 'ar';
/** The genotypes a person of this sex can have (unknown sex: either). */
export function pdGenotypesFor(mode, sex) {
  if (pdAutosomal(mode)) return ['a0', 'a1', 'a2'];
  const male = ['m0', 'm1'], female = mode === 'y' ? ['f0'] : ['f0', 'f1', 'f2'];
  return sex === 'm' ? male : sex === 'f' ? female : [...male, ...female];
}
const pdCopies = g => Number(g[1]), pdSexOf = g => g[0];
/** What a genotype looks like: affected, a carrier (one copy of a recessive allele), or unaffected. */
export function pdPhenotype(mode, g) {
  const n = pdCopies(g);
  if (mode === 'ad' || mode === 'xd' || mode === 'y') return n > 0 ? 'affected' : 'unaffected';
  if (mode === 'ar') return n === 2 ? 'affected' : n === 1 ? 'carrier' : 'unaffected';
  if (pdSexOf(g) === 'm') return n === 1 ? 'affected' : 'unaffected';
  return n === 2 ? 'affected' : n === 1 ? 'carrier' : 'unaffected';
}
/** Does a genotype fit what is drawn? With carriers shown, an unshaded symbol means not a carrier. */
export function pdFits(mode, g, p, carriersShown) {
  const ph = pdPhenotype(mode, g);
  if (p.affected) return ph === 'affected';
  if (carriersShown && p.carrier) return ph === 'carrier';
  return ph === 'unaffected' || (!carriersShown && ph === 'carrier');
}
/** The chance of a child's genotype from these parents (a child of unknown sex: its sex a coin toss). */
export function pdInherit(mode, father, mother, child, childSex) {
  const f = pdCopies(father), m = pdCopies(mother), n = pdCopies(child), sexChance = childSex === 'u' && !pdAutosomal(mode) ? 0.5 : 1;
  if (pdAutosomal(mode)) { const pf = f / 2, pm = m / 2; return [(1 - pf) * (1 - pm), pf * (1 - pm) + (1 - pf) * pm, pf * pm][n]; }
  if (mode === 'y') return pdSexOf(child) === 'f' ? sexChance * (n === 0 ? 1 : 0) : sexChance * (n === f ? 1 : 0);
  const pm = m / 2;
  if (pdSexOf(child) === 'm') return sexChance * (n === 1 ? pm : 1 - pm);
  return sexChance * [(1 - f) * (1 - pm), f * (1 - pm) + (1 - f) * pm, f * pm][n];
}
function pdFounder(mode, g, q, sex) {
  const n = pdCopies(g), sexChance = sex === 'u' && !pdAutosomal(mode) ? 0.5 : 1;
  if (pdAutosomal(mode) || pdSexOf(g) === 'f') { if (mode === 'y') return sexChance; return sexChance * [(1 - q) ** 2, 2 * q * (1 - q), q * q][n]; }
  return sexChance * (n === 1 ? q : 1 - q);
}
function pdFlatten(root, mode) {
  const people = new Map();
  for (const { ref, person } of pdEveryone(root)) people.set(pdRefKey(ref), { person, ref });
  const couples = []; let ok = true;
  const walk = (m, path) => {
    if (!m.partner || !m.children.length) return;
    const me = pdRefKey({ path, partner: false }), them = pdRefKey({ path, partner: true });
    let father = me, mother = them;
    if (m.sex === 'f' && m.partner.sex === 'm') [father, mother] = [them, me];
    else if (!(m.sex === 'm' && m.partner.sex === 'f') && !pdAutosomal(mode)) ok = false;
    const draws = [];
    m.children.forEach((c, i) => {
      const key = pdRefKey({ path: [...path, i], partner: false }), prev = m.children[i - 1];
      if (prev && prev.twin === 'mz' && prev.sex === c.sex) draws[draws.length - 1].push(key); else draws.push([key]);
      walk(c, [...path, i]);
    });
    couples.push({ father, mother, draws });
  };
  walk(root, []);
  return ok ? { people, couples } : null;
}
/** For each person (by key), the genotypes they could have; null when the family cannot be read for this mode (a couple
 *  that is not a man and a woman). An empty list for anyone: the family does not fit the mode. */
export function pdPossible(root, mode, carriersShown) {
  const flat = pdFlatten(root, mode);
  if (!flat) return null;
  const sets = new Map();
  for (const [key, { person }] of flat.people) sets.set(key, pdGenotypesFor(mode, person.sex).filter(g => pdFits(mode, g, person, carriersShown)));
  const sexOfKey = key => flat.people.get(key).person.sex;
  let changed = true;
  const set = (key, next) => { if (next.length !== sets.get(key).length) { sets.set(key, next); changed = true; } };
  while (changed) {
    changed = false;
    for (const c of flat.couples) {
      for (const draw of c.draws) { const shared = draw.reduce((acc, k) => acc.filter(g => sets.get(k).includes(g)), sets.get(draw[0])); for (const k of draw) set(k, shared); }
      const pairs = [];
      for (const gf of sets.get(c.father)) for (const gm of sets.get(c.mother)) if (c.draws.every(draw => sets.get(draw[0]).some(gc => pdInherit(mode, gf, gm, gc, sexOfKey(draw[0])) > 0))) pairs.push([gf, gm]);
      set(c.father, sets.get(c.father).filter(g => pairs.some(p => p[0] === g)));
      set(c.mother, sets.get(c.mother).filter(g => pairs.some(p => p[1] === g)));
      for (const draw of c.draws) { const kept = sets.get(draw[0]).filter(gc => pairs.some(([gf, gm]) => pdInherit(mode, gf, gm, gc, sexOfKey(draw[0])) > 0)); for (const k of draw) set(k, kept); }
    }
  }
  return sets;
}
/** Could the drawn family come from this mode at all? */
export function pdFitsMode(root, mode, carriersShown) { const sets = pdPossible(root, mode, carriersShown); return !!sets && [...sets.values()].every(s => s.length > 0); }
/** The chance of the whole drawn family under a mode (the trait allele q of the alleles among people who married in). */
export function pdLikelihood(root, mode, carriersShown, q = 0.01) {
  if (!pdFlatten(root, mode)) return 0;
  const pen = (p, g) => (pdFits(mode, g, p, carriersShown) ? 1 : 0);
  const alone = p => pdGenotypesFor(mode, p.sex).reduce((s, g) => s + pdFounder(mode, g, q, p.sex) * pen(p, g), 0);
  const below = (m, g) => {
    const own = pen(m, g);
    if (!own || !m.partner || !m.children.length) return own * (m.partner ? alone(m.partner) : 1);
    const partner = m.partner, male = m.sex === 'm' || (pdAutosomal(mode) && partner.sex !== 'm');
    let sum = 0;
    for (const gp of pdGenotypesFor(mode, partner.sex)) {
      const w = pdFounder(mode, gp, q, partner.sex) * pen(partner, gp);
      if (!w) continue;
      const [gf, gm] = male ? [g, gp] : [gp, g];
      let kids = 1;
      for (let i = 0; i < m.children.length && kids; i++) {
        const c = m.children[i], prev = m.children[i - 1];
        if (prev && prev.twin === 'mz' && prev.sex === c.sex) continue;
        const next = c.twin === 'mz' && m.children[i + 1] && m.children[i + 1].sex === c.sex ? m.children[i + 1] : null;
        let s = 0;
        for (const gc of pdGenotypesFor(mode, c.sex)) { const t = pdInherit(mode, gf, gm, gc, c.sex); if (t) s += t * below(c, gc) * (next ? below(next, gc) : 1); }
        kids *= s;
      }
      sum += w * kids;
    }
    return own * sum;
  };
  return pdGenotypesFor(mode, root.sex).reduce((s, g) => s + pdFounder(mode, g, q, root.sex) * below(root, g), 0);
}
export const PD_CLEAR_ODDS = 10;
/** Could students tell the family's inheritance is this mode: it fits, and every other is ruled out or far less likely? */
export function pdTells(root, mode, carriersShown = false) {
  if (!pdFitsMode(root, mode, carriersShown)) return false;
  const own = pdLikelihood(root, mode, carriersShown);
  return PD_MODES.every(other => other === mode || pdLikelihood(root, other, carriersShown) * PD_CLEAR_ODDS <= own);
}
const pdLettersOf = (mode, letter) => (mode === 'ad' || mode === 'xd' ? { trait: letter.toUpperCase(), other: letter.toLowerCase() } : { trait: letter.toLowerCase(), other: letter.toUpperCase() });
const pdDominantFirst = (a, b) => (a === a.toUpperCase() && b !== b.toUpperCase() ? -1 : a === b ? 0 : 1);
function pdAlleles(mode, g, letter) {
  const { trait, other } = pdLettersOf(mode, letter), n = pdCopies(g);
  if (pdAutosomal(mode)) return [n >= 1 ? trait : other, n === 2 ? trait : other].sort(pdDominantFirst).map(text => ({ text }));
  if (mode === 'y') return pdSexOf(g) === 'm' ? [{ text: 'X' }, n ? { text: 'Y', sup: letter.toUpperCase() } : { text: 'Y' }] : [{ text: 'X' }, { text: 'X' }];
  if (pdSexOf(g) === 'm') return [{ text: 'X', sup: n ? trait : other }, { text: 'Y' }];
  return [n >= 1 ? trait : other, n === 2 ? trait : other].sort(pdDominantFirst).map(sup => ({ text: 'X', sup }));
}
/** What a student would write for someone who could have any of these genotypes: the genotype, or a blank for the
 *  allele that cannot be told ("A_", "X^A X^_"); null when nothing sensible can be written. */
export function pdGenotypeLabel(mode, genotypes, letter) {
  if (!genotypes.length || new Set(genotypes.map(pdSexOf)).size > 1) return null;
  const options = genotypes.map(g => pdAlleles(mode, g, letter)), same = (a, b) => a.text === b.text && a.sup === b.sup;
  if (options.every(o => same(o[0], options[0][0]) && same(o[1], options[0][1]))) return options[0];
  if (!options.every(o => same(o[0], options[0][0]))) return null;
  const second = options[0][1];
  return [options[0][0], second.sup !== undefined ? { text: second.text, sup: '_' } : { text: '_' }];
}

// ---------------------------------------------------------------- a random family
const PD_SIZES = { small: { first: [2, 3], later: [1, 3], widest: 8 }, medium: { first: [3, 4], later: [2, 3], widest: 11 }, large: { first: [4, 5], later: [2, 4], widest: 14 } };
/** A small random number generator (mulberry32), so a seed always gives the same family. */
export function pdRandom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pdBetween = (rand, [lo, hi]) => lo + Math.floor(rand() * (hi - lo + 1));
function pdShape(rand, generations, size, fewest) {
  const { later } = PD_SIZES[size], first = [Math.max(fewest, PD_SIZES[size].first[0]), Math.max(fewest, PD_SIZES[size].first[1])], sex = () => (rand() < 0.5 ? 'm' : 'f');
  const grow = (s, generation) => {
    const n = Math.min(PD_MAX_CHILDREN, pdBetween(rand, generation === 1 ? first : later));
    s.partner = s.sex === 'm' ? 'f' : 'm';
    s.children = Array.from({ length: n }, () => ({ sex: sex(), children: [] }));
    if (generation + 1 >= generations) return;
    const chance = size === 'small' ? 0.4 : size === 'medium' ? 0.5 : 0.6, grown = s.children.filter(() => rand() < chance);
    if (!grown.length) grown.push(s.children[Math.floor(rand() * s.children.length)]);
    for (const c of grown) grow(c, generation + 1);
  };
  const root = { sex: rand() < 0.5 ? 'm' : 'f', children: [] };
  grow(root, 1);
  return root;
}
function pdWidest(s) { const rows = []; const walk = (x, g) => { rows[g] = (rows[g] || 0) + 1 + (x.partner ? 1 : 0); x.children.forEach(c => walk(c, g + 1)); }; walk(s, 0); return Math.max(...rows); }
const PD_FOUNDERS = {
  ad: [{ m: 1, f: 0, weight: 1 }, { m: 0, f: 1, weight: 1 }], ar: [{ m: 1, f: 1, weight: 5 }, { m: 2, f: 1, weight: 1 }, { m: 1, f: 2, weight: 1 }],
  xr: [{ m: 0, f: 1, weight: 4 }, { m: 1, f: 0, weight: 1 }], xd: [{ m: 1, f: 0, weight: 3 }, { m: 0, f: 1, weight: 2 }], y: [{ m: 1, f: 0, weight: 1 }],
};
const PD_MARRIED_IN = { ad: { m: 0, f: 0 }, ar: { m: 0.5, f: 0.5 }, xr: { m: 0, f: 0.1 }, xd: { m: 0, f: 0 }, y: { m: 0, f: 0 } };
const pdCode = (mode, sex, copies) => (pdAutosomal(mode) ? `a${copies}` : `${sex}${copies}`);
function pdChildOf(rand, mode, father, mother, sex) {
  const options = pdGenotypesFor(mode, sex);
  let r = rand();
  for (const g of options) { r -= pdInherit(mode, father, mother, g, sex); if (r < 0) return g; }
  return options.find(g => pdInherit(mode, father, mother, g, sex) > 0);
}
const pdDrawn = (mode, sex, g) => { const ph = pdPhenotype(mode, g); return pdPerson(sex, { affected: ph === 'affected', carrier: ph === 'carrier' }); };
function pdTry(rand, mode, generations, size) {
  const sexLinked = mode === 'xd' || mode === 'y', fewest = sexLinked && generations === 2 ? 5 : sexLinked && generations === 3 ? 4 : 1;
  let shape = pdShape(rand, generations, size, fewest);
  for (let i = 0; i < 20 && pdWidest(shape) > PD_SIZES[size].widest; i++) shape = pdShape(rand, generations, size, fewest);
  const founders = PD_FOUNDERS[mode];
  let r = rand() * founders.reduce((s, f) => s + f.weight, 0);
  const start = founders.find(f => (r -= f.weight) < 0) || founders[0];
  const marriedIn = sex => { const chance = PD_MARRIED_IN[mode][sex]; return !chance || rand() >= chance ? pdCode(mode, sex, 0) : pdCode(mode, sex, 1); };
  const build = (s, g, partnerG) => {
    const m = { ...pdDrawn(mode, s.sex, g), children: [] };
    if (!s.partner) return m;
    const pg = partnerG || marriedIn(s.partner);
    m.partner = pdDrawn(mode, s.partner, pg);
    const [father, mother] = s.sex === 'm' ? [g, pg] : [pg, g];
    m.children = s.children.map(c => build(c, pdChildOf(rand, mode, father, mother, c.sex)));
    return m;
  };
  return build(shape, pdCode(mode, shape.sex, start[shape.sex]), pdCode(mode, shape.partner, start[shape.partner]));
}
function pdShare(m) { let all = 0, affected = 0; const walk = x => { for (const p of [x, x.partner].filter(Boolean)) { all++; if (p.affected) affected++; } x.children.forEach(walk); }; walk(m); return { all, affected }; }
export const PD_SIZE_NAMES = Object.keys(PD_SIZES);
/** A random family for a mode, from a seed: the first of up to 400 tries a student could diagnose, or else the first
 *  with the trait showing (but not in most of the family). */
export function pdRandomFamily(mode, generations, size, seed, tries = 400) {
  const rand = pdRandom(seed);
  let fallback = null;
  for (let i = 0; i < tries; i++) {
    const family = pdTry(rand, mode, generations, size), { all, affected } = pdShare(family);
    if (!(affected >= (generations > 2 ? 3 : 2) && affected <= all * 0.6)) continue;
    fallback = fallback || family;
    if (pdTells(family, mode)) return family;
  }
  return fallback || pdTry(pdRandom(seed), mode, generations, size);
}

// ---------------------------------------------------------------- the layout
export const PD_SYMBOL = 36;
const PD_SPACING = 62, PD_COUSIN_GAP = 20, PD_DROP = 20, PD_NUMERAL_WIDTH = 34, PD_LEFT = PD_SYMBOL / 2 + 24, PD_RIGHT = PD_SYMBOL / 2 + 8, PD_TOP = PD_SYMBOL / 2 + 6;
const PD_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
export const pdRoman = n => PD_ROMAN[n - 1] || String(n);
function pdSide(m, siblings, i) {
  const maleLeft = m.sex === 'f' ? -1 : 1;
  if (!siblings || siblings.length < 2) return maleLeft;
  if (m.twin) return -1;
  if (siblings[i - 1] && siblings[i - 1].twin) return 1;
  if (i === 0) return -1;
  if (i === siblings.length - 1) return 1;
  return maleLeft;
}
function pdTree(root, d) {
  const build = (m, path, side) => {
    const xs = new Map([[pdRefKey({ path, partner: false }), 0]]);
    let left = [0], right = [0];
    if (m.partner) { xs.set(pdRefKey({ path, partner: true }), side * d); left = [Math.min(0, side * d)]; right = [Math.max(0, side * d)]; }
    if (!m.partner || !m.children.length) return { left, right, xs };
    const kids = m.children.map((c, i) => build(c, [...path, i], pdSide(c, m.children, i))), offsets = [], accL = [], accR = [];
    kids.forEach((k, i) => {
      let off = 0;
      if (i > 0) { off = -Infinity; for (let r = 0; r < k.left.length; r++) { if (accR[r] === undefined) continue; off = Math.max(off, accR[r] - k.left[r] + (r === 0 ? d : d + PD_COUSIN_GAP)); } if (off === -Infinity) off = 0; }
      offsets.push(off);
      k.left.forEach((v, r) => (accL[r] = Math.min(accL[r] ?? Infinity, v + off)));
      k.right.forEach((v, r) => (accR[r] = Math.max(accR[r] ?? -Infinity, v + off)));
    });
    const shift = (side * d) / 2 - (offsets[0] + offsets[offsets.length - 1]) / 2;
    kids.forEach((k, i) => { for (const [key, x] of k.xs) xs.set(key, x + offsets[i] + shift); });
    accL.forEach((v, r) => (left[r + 1] = v + shift)); accR.forEach((v, r) => (right[r + 1] = v + shift));
    return { left, right, xs };
  };
  return build(root, [], pdSide(root, null, 0)).xs;
}
/** Where everyone goes and the lines between them: { width, height, people: [{ key, person, x, y, generation, name }],
 *  lines: [{ x1, y1, x2, y2 }], numerals: [{ text, y }], labelY }. o: { numerals, rows (label rows under a symbol),
 *  labelWidth }. */
export function pdLayout(root, o) {
  const d = Math.max(PD_SPACING, Math.ceil(o.labelWidth || 0) + 12), bottom = PD_SYMBOL / 2 + 4 + 18 * (o.rows || 0), row = Math.max(96, bottom + 14 + PD_DROP + PD_SYMBOL / 2), xs = pdTree(root, d);
  const people = [];
  const collect = (m, path) => {
    const g = path.length, k = pdRefKey({ path, partner: false });
    people.push({ key: k, person: m, x: xs.get(k), y: g * row, generation: g, name: '' });
    if (m.partner) { const kp = pdRefKey({ path, partner: true }); people.push({ key: kp, person: m.partner, x: xs.get(kp), y: g * row, generation: g, name: '' }); }
    m.children.forEach((c, i) => collect(c, [...path, i]));
  };
  collect(root, []);
  const minX = Math.min(...people.map(p => p.x)), maxX = Math.max(...people.map(p => p.x)), dx = (o.numerals ? PD_NUMERAL_WIDTH : 0) + PD_LEFT - minX, generations = Math.max(...people.map(p => p.generation)) + 1;
  for (const p of people) { p.x += dx; p.y += PD_TOP; }
  for (let g = 0; g < generations; g++) people.filter(p => p.generation === g).sort((a, b) => a.x - b.x).forEach((p, i) => (p.name = `${pdRoman(g + 1)}-${i + 1}`));
  const at = new Map(people.map(p => [p.key, p])), lines = [], half = PD_SYMBOL / 2;
  const walk = (m, path) => {
    if (!m.partner) return;
    const a = at.get(pdRefKey({ path, partner: false })), b = at.get(pdRefKey({ path, partner: true })), [l, r] = a.x < b.x ? [a, b] : [b, a], y = a.y;
    if (m.consanguineous) lines.push({ x1: l.x + half, y1: y - 3, x2: r.x - half, y2: y - 3 }, { x1: l.x + half, y1: y + 3, x2: r.x - half, y2: y + 3 });
    else lines.push({ x1: l.x + half, y1: y, x2: r.x - half, y2: y });
    if (!m.children.length) return;
    const mid = (l.x + r.x) / 2, kids = m.children.map((_, i) => at.get(pdRefKey({ path: [...path, i], partner: false }))), sibY = kids[0].y - half - PD_DROP, tops = kids.map(k => k.x);
    m.children.forEach((c, i) => { if (c.twin && kids[i + 1]) tops[i] = tops[i + 1] = (kids[i].x + kids[i + 1].x) / 2; });
    const from = Math.min(mid, ...tops), to = Math.max(mid, ...tops);
    lines.push({ x1: mid, y1: y + (m.consanguineous ? 3 : 0), x2: mid, y2: sibY });
    if (to > from) lines.push({ x1: from, y1: sibY, x2: to, y2: sibY });
    kids.forEach((k, i) => lines.push({ x1: tops[i], y1: sibY, x2: k.x, y2: k.y - half }));
    m.children.forEach((c, i) => {
      if (c.twin !== 'mz' || !kids[i + 1]) return;
      const ya = sibY + (kids[i].y - half - sibY) * 0.5;
      lines.push({ x1: tops[i] + (kids[i].x - tops[i]) * 0.5, y1: ya, x2: tops[i] + (kids[i + 1].x - tops[i]) * 0.5, y2: ya });
    });
    m.children.forEach((c, i) => walk(c, [...path, i]));
  };
  walk(root, []);
  const numerals = o.numerals ? Array.from({ length: generations }, (_, g) => ({ text: pdRoman(g + 1), y: PD_TOP + g * row })) : [];
  return { width: maxX + dx + PD_RIGHT, height: PD_TOP + (generations - 1) * row + bottom + 4, people, lines, numerals, generations };
}
