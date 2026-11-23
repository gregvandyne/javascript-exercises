// Oomba Figures: the cladogram (1.7.0, the biology pack). A cladogram (straight branches, the taxa along the top) or a
// phylogenetic tree (square elbows, the taxa down the right) of up to 16 taxa, with the traits each clade shares
// ticked on the branch leading into it, laid out by ported/clado.js. The tree comes from a ready-made setup
// ("vertebrates", "plants", "apes", "letters"), a ladder (taxa and the trait gained before each branches off), a ladder
// of letters with numbered traits, or the teacher's own nested tree. Marked traits or taxa are boxed, and OF.solve
// answers about them: how many taxa share a trait, which of two traits came first, a taxon's closest relative.
// hide: "taxa" (blank lines for the names), "traits" (numbered blank lines for the traits), true (both).
import { node, label, line, frame, palette, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { CL_MAX_TAXA, CL_MAX_LABEL, CL_NAME_SIZE, CL_TRAIT_SIZE, CL_NUMBER_R, CL_NAME_BLANK_W, CL_TRAIT_BLANK_W, CL_NAME_LINE, clIsClade, clTaxon, clTaxaOf, clWithTraits, clCollapse, clLadder, CL_SETUPS, clLayout, clBlankLabel } from './ported/clado.js';

const CL_KEYS = ['kind', 'hide', 'setup', 'tree', 'taxa', 'traits', 'letters', 'style', 'taxaLabels', 'traitLabels', 'numbers', 'mark', 'heading'];
/** The words a cladogram writes by itself (its title), by site language. */
const CL_WORDS = {
  en: { cladogram: 'Cladogram', tree: 'Phylogenetic tree' }, es: { cladogram: 'Cladograma', tree: 'Árbol filogenético' }, fr: { cladogram: 'Cladogramme', tree: 'Arbre phylogénétique' },
  de: { cladogram: 'Kladogramm', tree: 'Stammbaum' }, it: { cladogram: 'Cladogramma', tree: 'Albero filogenetico' }, pt: { cladogram: 'Cladograma', tree: 'Árvore filogenética' },
  nl: { cladogram: 'Cladogram', tree: 'Fylogenetische boom' }, ru: { cladogram: 'Кладограмма', tree: 'Филогенетическое дерево' }, ja: { cladogram: '分岐図', tree: '系統樹' },
  'zh-Hant': { cladogram: '分支圖', tree: '系統發生樹' }, ar: { cladogram: 'مخطط تفرعي', tree: 'شجرة تطور السلالات' }, he: { cladogram: 'קלדוגרמה', tree: 'עץ פילוגנטי' },
};
const clWord = (lang, k) => { const l = String(lang || 'en'); return (CL_WORDS[l] || CL_WORDS[l.split('-')[0]] || CL_WORDS.en)[k] || CL_WORDS.en[k] || figWords(lang)(k); };
const str = v => (typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : null);

/** The teacher's tree, read and checked: { tree } or { problem }. */
function readNode(v, depth, room) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { problem: 'each node of "tree" is a taxon { name } or a clade { trait, children: [...] }' };
  if (Array.isArray(v.children)) {
    if (depth > CL_MAX_TAXA) return { problem: 'the tree is nested too deep' };
    if (Object.keys(v).some(k => !['trait', 'children'].includes(k))) return { problem: 'a clade is { trait, children }' };
    if (!v.children.length) return { problem: 'a clade needs its members ("children")' };
    const t = v.trait === undefined ? '' : str(v.trait);
    if (t === null || t.length > CL_MAX_LABEL) return { problem: `a trait must be a short text (at most ${CL_MAX_LABEL} characters)` };
    const kids = [];
    for (const c of v.children) { const r = readNode(c, depth + 1, room); if (r.problem) return r; kids.push(r.tree); }
    return { tree: { trait: t, children: kids } };
  }
  if (Object.keys(v).some(k => !['name', 'trait'].includes(k))) return { problem: 'a taxon is { name } (and its own "trait")' };
  const name = str(v.name), t = v.trait === undefined ? undefined : str(v.trait);
  if (name === null || name.length > CL_MAX_LABEL || (v.trait !== undefined && (t === null || t.length > CL_MAX_LABEL))) return { problem: `each taxon needs a "name" (at most ${CL_MAX_LABEL} characters)` };
  if (--room.taxa < 0) return { problem: `a cladogram has at most ${CL_MAX_TAXA} taxa` };
  return { tree: clTaxon(name, t) };
}
/** The tree from the data: { tree } or { problem }. */
function treeOf(d) {
  const given = ['setup', 'tree', 'taxa', 'letters'].filter(k => d[k] !== undefined);
  if (given.length !== 1) return { problem: 'give the tree one way: "setup", "tree", "taxa" (a ladder, with "traits") or "letters"' };
  if (d.traits !== undefined && d.taxa === undefined) return { problem: '"traits" go with "taxa" (a ladder)' };
  if (d.setup !== undefined) return CL_SETUPS[d.setup] ? { tree: CL_SETUPS[d.setup]() } : { problem: `"setup" must be ${Object.keys(CL_SETUPS).join(', ')}` };
  if (d.letters !== undefined) {
    if (!Number.isInteger(d.letters) || d.letters < 3 || d.letters > 8) return { problem: '"letters" must be 3 to 8 (taxa A, B, C... with numbered traits)' };
    return { tree: clLadder(Array.from({ length: d.letters }, (_, i) => String.fromCharCode(65 + i)), ['', ...Array.from({ length: d.letters - 1 }, (_, i) => String(i + 1))]) };
  }
  if (d.taxa !== undefined) {
    const taxa = Array.isArray(d.taxa) ? d.taxa.map(str) : null, traits = d.traits === undefined ? [] : Array.isArray(d.traits) ? d.traits.map(str) : null;
    if (!taxa || taxa.length < 2 || taxa.length > CL_MAX_TAXA || taxa.some(x => x === null || x.length > CL_MAX_LABEL)) return { problem: `"taxa" lists 2 to ${CL_MAX_TAXA} names, the one that branches off first first` };
    if (!traits || traits.length > taxa.length || traits.some(x => x === null || x.length > CL_MAX_LABEL)) return { problem: '"traits" lists the trait gained before each taxon branches off (the first is on the root; "" for none), at most one per taxon' };
    return { tree: clLadder(taxa, traits) };
  }
  const r = readNode(d.tree, 0, { taxa: CL_MAX_TAXA });
  if (r.problem) return r;
  const t = clCollapse(r.tree);
  if (!t || !clIsClade(t) || clTaxaOf(t).length < 2) return { problem: 'the tree needs at least 2 taxa' };
  return { tree: t };
}
/** The marked traits and taxa: [{ trait: node } | { taxon: node, tip }] or { problem }. */
function marksOf(d, tree) {
  if (d.mark === undefined) return [];
  if (!Array.isArray(d.mark) || d.mark.length > 3) return { problem: '"mark" lists up to 3 traits (by name, or { trait: 1 } for the first from the root) or taxa ({ tip: 1 } for the first tip)' };
  const taxa = clTaxaOf(tree), traits = clWithTraits(tree), out = [];
  for (const m of d.mark) {
    if (m && typeof m === 'object' && !Array.isArray(m)) {
      if (m.trait !== undefined && m.tip === undefined) {
        if (!Number.isInteger(m.trait) || m.trait < 1 || m.trait > traits.length) return { problem: `a marked trait by number is { trait: 1 to ${traits.length} } (numbered from the root)` };
        out.push({ trait: traits[m.trait - 1] });
        continue;
      }
      if (!Number.isInteger(m.tip) || m.tip < 1 || m.tip > taxa.length || m.trait !== undefined) return { problem: `a marked taxon is { tip: 1 to ${taxa.length} }` };
      out.push({ taxon: taxa[m.tip - 1], tip: m.tip });
    } else {
      const name = str(m), hits = traits.filter(n => n.trait.trim() === name);
      if (!name || hits.length !== 1) return { problem: `"mark" names a trait the tree has once (${JSON.stringify(m)} is ${hits.length ? 'on two branches' : 'not one'})` };
      out.push({ trait: hits[0] });
    }
  }
  return out;
}
/** The path of nodes from the root down to n (the root first), or null. */
function pathTo(root, n) {
  if (root === n) return [root];
  if (!clIsClade(root)) return null;
  for (const c of root.children) { const p = pathTo(c, n); if (p) return [root, ...p]; }
  return null;
}

export const cladogram = {
  check(d) {
    const out = Object.keys(d).filter(k => !CL_KEYS.includes(k)).map(k => `"${k}" is not used by a cladogram`);
    if (d.style !== undefined && !['diagonal', 'rectangular'].includes(d.style)) out.push('"style" must be "diagonal" (a cladogram) or "rectangular" (a phylogenetic tree)');
    if (d.taxaLabels !== undefined && !['names', 'blank'].includes(d.taxaLabels)) out.push('"taxaLabels" must be "names" or "blank"');
    if (d.traitLabels !== undefined && !['names', 'blank', 'ticks', 'none'].includes(d.traitLabels)) out.push('"traitLabels" must be "names", "blank", "ticks" or "none"');
    if (d.numbers !== undefined && typeof d.numbers !== 'boolean') out.push('"numbers" must be true or false');
    if (d.heading !== undefined && !text(d.heading, 60)) out.push('"heading" must be a short text');
    const t = treeOf(d);
    if (t.problem) return [...out, t.problem];
    const names = clTaxaOf(t.tree).map(x => x.name.trim()).filter(Boolean);
    if (new Set(names).size !== names.length) out.push('each taxon needs its own name');
    const m = marksOf(d, t.tree);
    if (m.problem) out.push(m.problem);
    return out;
  },
  /** The taxa and traits, how many taxa share each trait, the trait gained first (when every other is inside it), the
   *  outgroup, and about the marked ones: how many taxa share the first marked trait (shared), which of two marked
   *  traits came first (earlier: 0 the first, 1 the second, -1 neither), a marked taxon's closest relative (sister,
   *  when that is one taxon) and, of three marked taxa, which of the second and third is closer to the first (closer). */
  solve(d) {
    if (cladogram.check(d).length) return null;
    const tree = treeOf(d).tree, taxa = clTaxaOf(tree), traits = clWithTraits(tree), shared = {};
    for (const n of traits) shared[n.trait.trim()] = clTaxaOf(n).length;
    const first = traits.length && traits.every(n => !!pathTo(traits[0], n)) ? traits[0].trait.trim() : '';
    const lone = tree.children.filter(c => !clIsClade(c));
    const out = { taxa: taxa.length, names: taxa.map(x => x.name), traits: traits.length, shared, first, outgroup: tree.children.length === 2 && lone.length === 1 ? lone[0].name : '', marked: {} };
    const marks = marksOf(d, tree), mt = marks.filter(m => m.trait), mx = marks.filter(m => m.taxon);
    if (mt.length) out.marked.shared = clTaxaOf(mt[0].trait).length;
    if (mt.length >= 2) { const a = mt[0].trait, b = mt[1].trait; out.marked.earlier = pathTo(a, b) ? 0 : pathTo(b, a) ? 1 : -1; if (out.marked.earlier >= 0) out.marked.firstTrait = (out.marked.earlier ? b : a).trait.trim(); }
    if (mx.length) {
      const p = pathTo(tree, mx[0].taxon), parent = p[p.length - 2], sibs = parent.children.filter(c => c !== mx[0].taxon), rel = sibs.flatMap(clTaxaOf);
      out.marked.sister = rel.length === 1 ? rel[0].name : ''; out.marked.relatives = rel.length;
    }
    if (mx.length >= 3) {
      const depth = (a, b) => { const pa = pathTo(tree, a), pb = pathTo(tree, b); let k = 0; while (k < pa.length && pa[k] === pb[k]) k++; return k; };
      const db = depth(mx[0].taxon, mx[1].taxon), dc = depth(mx[0].taxon, mx[2].taxon);
      out.marked.closer = db > dc ? 0 : dc > db ? 1 : -1;
    }
    // the same answers at the top level too, for a question's key
    if (out.marked.firstTrait !== undefined) out.firstTrait = out.marked.firstTrait;
    if (out.marked.sister !== undefined) out.sister = out.marked.sister;
    return out;
  },
  draw(d, o) {
    const P = palette(o), tree = treeOf(d).tree, style = d.style || 'diagonal';
    const blankTaxa = o.hide === true || hides(o, 'taxa') || d.taxaLabels === 'blank', tl = d.traitLabels || 'names';
    const traitsMode = (o.hide === true || hides(o, 'traits')) && tl !== 'none' ? 'blank' : tl;
    const L = clLayout({ tree, style, taxa: blankTaxa ? 'blank' : 'names', traits: traitsMode, nodeNumbers: !!d.numbers });
    const top = d.heading ? 30 : 0, marks = marksOf(d, tree), g = [], branch = o.print ? P.ink : P.greenInk, hi = P.red;
    for (const b of L.branches) g.push(node('polyline', { points: b.map(q => `${r2(q.x)},${r2(q.y)}`).join(' '), fill: 'none', stroke: branch, 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'of-branch' }));
    for (const t of L.traits) {
      g.push(line(t.tick[0].x, t.tick[0].y, t.tick[1].x, t.tick[1].y, P.ink, 2.2, { class: 'of-tick' }));
      if (!t.box) continue;
      if (t.text) g.push(label(t.box.x, t.box.y + t.box.h / 2, t.text, { size: CL_TRAIT_SIZE, weight: 600, colour: P.ink, halo: P.paper, cls: 'of-trait' }));
      else { const lab = clBlankLabel(t.number || 1), w = 0.56 * CL_TRAIT_SIZE * lab.length + 4; g.push(label(t.box.x, t.box.y + t.box.h / 2, lab, { size: CL_TRAIT_SIZE, colour: P.ink, halo: P.paper, cls: 'of-trait' }), line(t.box.x + w, t.box.y + t.box.h, t.box.x + w + CL_TRAIT_BLANK_W, t.box.y + t.box.h, P.ink, 1.2, { class: 'of-blank' })); }
    }
    for (const nm of L.names) {
      if (!nm.lines.length) { g.push(line(nm.box.x, nm.box.y + nm.box.h, nm.box.x + CL_NAME_BLANK_W, nm.box.y + nm.box.h, P.ink, 1.2, { class: 'of-blank' })); continue; }
      nm.lines.forEach((ln, i) => g.push(label(nm.x, nm.y + CL_NAME_LINE * i + CL_NAME_LINE / 2, ln, { anchor: nm.anchor, size: CL_NAME_SIZE, colour: P.ink, cls: 'of-taxon' })));
    }
    for (const nd of L.nodes) g.push(node('circle', { cx: nd.x, cy: nd.y, r: CL_NUMBER_R, fill: P.paper, stroke: P.ink, 'stroke-width': 1.6 }), label(nd.x, nd.y + 1, String(nd.n), { anchor: 'middle', size: 12, colour: P.ink }));
    for (const m of marks) {
      const box = m.trait ? (L.traits.find(t => t.node === m.trait) || {}).box : (L.names.find(nm => nm.node === m.taxon) || {}).box;
      if (box) g.push(node('rect', { x: r2(box.x - 4), y: r2(box.y - 3), width: r2(box.w + 8), height: r2(box.h + 6), rx: 5, fill: 'none', stroke: hi, 'stroke-width': 2, class: 'of-marked' }));
    }
    const kids = [];
    const Wd = Math.max(L.width + 8, 240);
    if (d.heading) kids.push(label(Wd / 2, 18, text(d.heading, 60), { anchor: 'middle', size: 15, colour: P.ink }));
    kids.push(node('g', { transform: `translate(${r2((Wd - L.width) / 2)} ${top + 4})` }, g));
    return frame(Wd, L.height + top + 12, kids, { ...o, kind: 'cladogram' }, o.title || clWord(o.lang, style === 'rectangular' ? 'tree' : 'cladogram'));
  },
};
export const CLADO_KINDS = { cladogram };
