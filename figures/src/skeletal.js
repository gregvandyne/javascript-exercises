// Oomba Figures: organic structures (1.5.0, the chemistry pack), drawn as plain lines and text from one shape, so a
// printed worksheet and the server's thumbnails show them as the screen does. The shape comes from the data: atoms with
// their places and bonds (the way a teacher draws one), a SMILES-lite text (the organic subset: chains, branches, single
// rings of 3 to 8 atoms, benzene and pyridine rings, which Oomba lays out itself on 30 degree steps, zigzag or
// straight), or a straight chain of carbons with its double and triple bonds and groups (what a generator can deal).
// Every view (skeletal formula, carbon skeleton, condensed, full structural) is ported/organic.js's, from that one shape;
// the reading of the data, the layout, the checks with their "cannot be drawn" reasons, the answers (OF.solve: the
// molecular formula, the counts, the molar mass, the degree of unsaturation and the functional groups), hide, print and
// the drawing are Oomba's own. A structure that cannot be drawn truthfully (an atom with too many bonds, rings that share
// atoms, a layout where atoms or bonds would overlap, a skeletal formula that would hide a carbon in a straight line) is
// refused with its reason, never drawn wrong.
import { node, frame, palette, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { OG_VALENCE, OG_ELEMENTS, OG_BOND, OG_FONT, OG_SUB_FONT, OG_SUB_DROP, OG_NUMBER_FONT, OG_STAR_FONT, ogDrawView, ogBondsOf, ogNeighbors, ogAtomById, ogOtherEnd, ogAddedHydrogens, ogOverbonded, ogIsHidden, ogParts, ogShortestPath, ogDistanceToSegment, ogNumberBox, ogStarBox } from './ported/organic.js';

const SK_KEYS = ['kind', 'hide', 'smiles', 'chain', 'double', 'triple', 'groups', 'atoms', 'bonds', 'view', 'layout', 'ends', 'rings', 'acids', 'reverse', 'numbers', 'flip', 'chiral', 'name', 'formula'];
const SK_VIEWS = ['skeletal', 'carbons', 'condensed', 'full'];
const SK_MAX_ATOMS = 40;
const SK_GROUPS = { OH: 'O', NH2: 'N', F: 'F', Cl: 'Cl', Br: 'Br', I: 'I', CH3: 'C', C2H5: 'CC', '=O': '=O' };
/** Standard atomic weights (IUPAC, conventional values) for the molar mass. */
const SK_MASS = { C: 12.011, H: 1.008, O: 15.999, N: 14.007, S: 32.06, P: 30.974, F: 18.998, Cl: 35.45, Br: 79.904, I: 126.904 };

// ---------------------------------------------------------------- SMILES-lite
/** SMILES-lite text -> { atoms: [{ element, aromatic }], bonds: [{ a, b, order, ring }], parts } or { error }. */
export function skParse(src) {
  const s = String(src), atoms = [], bonds = [], open = new Map(), stack = [];
  let prev = null, order = null, i = 0, parts = 1;
  const fail = why => ({ error: why });
  const addBond = (a, b, o, ring = false) => { if (bonds.some(x => (x.a === a && x.b === b) || (x.a === b && x.b === a))) return false; bonds.push({ a, b, order: o, ring }); return true; };
  while (i < s.length) {
    const c = s[i];
    if (c === '[') return fail('bracket atoms (charges, isotopes, hydrogens written in) are not drawn: leave the hydrogens out, they are worked out from each atom\'s valence');
    if (c === '/' || c === '\\' || c === '@') return fail('stereo marks (/, \\, @) are not drawn: mark a chiral center with "chiral" instead');
    if (c === '%' || c === ':' || c === '$' || c === '+') return fail(`"${c}" is not part of the SMILES Oomba reads (atoms, branches, - = #, ring digits 1 to 9, and . between molecules)`);
    if (c === '(') { if (prev === null) return fail('a branch must follow an atom'); stack.push(prev); i++; continue; }
    if (c === ')') { if (!stack.length) return fail('a ")" closes no branch'); if (order !== null) return fail('a bond must lead to an atom'); prev = stack.pop(); i++; continue; }
    if (c === '-' || c === '=' || c === '#') { if (order !== null || prev === null) return fail('a bond must be between two atoms'); order = c === '-' ? 1 : c === '=' ? 2 : 3; i++; continue; }
    if (c === '.') { if (order !== null || prev === null || stack.length) return fail('"." goes between two whole molecules'); prev = null; parts++; i++; continue; }
    if (/[1-9]/.test(c)) {
      if (prev === null) return fail('a ring digit must follow an atom');
      if (open.has(c)) {
        const [at, o1] = open.get(c), o = order ?? o1 ?? (atoms[at].aromatic && atoms[prev].aromatic ? 'a' : 1);
        if (at === prev || !addBond(at, prev, o, true)) return fail(`ring ${c} closes on the atom it opened at, or on a bond already there`);
        open.delete(c);
      } else open.set(c, [prev, order]);
      order = null; i++; continue;
    }
    const m = /^(Cl|Br|C|N|O|S|P|F|I|R|X|c|n)/.exec(s.slice(i));
    if (!m) return fail(`"${c}" is not an atom Oomba draws (C, N, O, S, P, F, Cl, Br, I, R and X, and c and n in aromatic rings)`);
    const aromatic = m[1] === 'c' || m[1] === 'n', element = aromatic ? m[1].toUpperCase() : m[1], id = atoms.length;
    atoms.push({ element, aromatic });
    if (atoms.length > SK_MAX_ATOMS) return fail(`at most ${SK_MAX_ATOMS} atoms (not counting the hydrogens)`);
    if (prev !== null) addBond(prev, id, order ?? (atoms[prev].aromatic && aromatic ? 'a' : 1));
    prev = id; order = null; i += m[1].length;
  }
  if (order !== null) return fail('the text ends with a bond');
  if (stack.length) return fail('a "(" is never closed');
  if (open.size) return fail(`ring ${[...open.keys()][0]} is never closed`);
  if (!atoms.length) return fail('the SMILES has no atoms');
  return { atoms, bonds, parts };
}
/** A straight chain -> SMILES-lite: carbons 1 to n, bonds k to k + 1 double or triple, groups on carbons. */
export function skChainSmiles(d) {
  const n = d.chain, at = k => (d.groups || []).filter(g => g.at === k).map(g => SK_GROUPS[g.group]);
  let out = '';
  for (let k = 1; k <= n; k++) {
    const g = at(k);
    out += `${k > 1 ? ((d.double || []).includes(k - 1) ? '=' : (d.triple || []).includes(k - 1) ? '#' : '') : ''}C${(k === n ? g.slice(0, -1) : g).map(x => `(${x})`).join('')}${k === n && g.length ? g[g.length - 1] : ''}`;
  }
  return out;
}

// ---------------------------------------------------------------- rings and the layout
/** The rings (each a list of atom indices in order round it), from the ring-closing bonds; null when rings share atoms. */
function skRings(g) {
  const tree = { atoms: g.atoms.map((a, i) => ({ id: String(i), ...a })), bonds: g.bonds.filter(b => !b.ring).map((b, k) => ({ id: `t${k}`, a: String(b.a), b: String(b.b), order: 1 })) };
  const rings = g.bonds.filter(b => b.ring).map(b => ogShortestPath(tree, String(b.a), String(b.b)).map(Number));
  const seen = new Set();
  for (const r of rings) for (const a of r) { if (seen.has(a)) return null; seen.add(a); }
  return rings;
}
/** Aromatic rings get their alternating double bonds (Kekulé): six aromatic atoms in a ring, nothing else. */
function skKekule(g, rings) {
  const bondOf = (a, b) => g.bonds.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  for (const r of rings) {
    const ar = r.filter(a => g.atoms[a].aromatic).length;
    if (!ar) continue;
    if (ar !== r.length || r.length !== 6) return 'aromatic atoms (lowercase c and n) go in rings of six (benzene, pyridine); write any other ring with its double bonds (C1=CC=CO1)';
    r.forEach((a, k) => { bondOf(a, r[(k + 1) % 6]).order = k % 2 ? 1 : 2; });
  }
  if (g.atoms.some((a, i) => a.aromatic && !rings.some(r => r.includes(i)))) return 'an aromatic atom (lowercase c or n) must be in a ring';
  if (g.bonds.some(b => b.order === 'a')) return 'aromatic atoms are bonded in their ring only';
  return '';
}
const SK_RAD = Math.PI / 180;
const skDir = (deg, len = 1) => ({ x: Math.cos(deg * SK_RAD) * len, y: Math.sin(deg * SK_RAD) * len });
/** Places every atom (in bond lengths, y down the page), or says why it cannot. */
function skLayout(g, rings, style) {
  const n = g.atoms.length, adj = Array.from({ length: n }, () => []), pos = new Array(n).fill(null), ringOf = new Array(n).fill(-1);
  g.bonds.forEach(b => { adj[b.a].push(b); adj[b.b].push(b); });
  rings.forEach((r, k) => r.forEach(a => { ringOf[a] = k; }));
  const other = (b, a) => (b.a === a ? b.b : b.a);
  const size = (a, from) => { const seen = new Set([from, a]), q = [a]; while (q.length) { const x = q.pop(); for (const b of adj[x]) { const y = other(b, x); if (!seen.has(y)) { seen.add(y); q.push(y); } } } return seen.size - 1; };
  const linear = a => adj[a].some(b => b.order === 3) || adj[a].filter(b => b.order === 2).length === 2;
  const level = deg => Math.abs(Math.sin(deg * SK_RAD));
  // place a chain atom a, reached going in direction dir; turn: the sign of the last zigzag turn
  const place = (a, from, dir, turn) => {
    if (ringOf[a] >= 0) return placeRing(ringOf[a], a, from, dir);
    const kids = adj[a].map(b => other(b, a)).filter(x => x !== from && !pos[x]);
    kids.sort((x, y) => size(y, a) - size(x, a) || x - y);
    let dirs;
    if (style === 'straight') dirs = kids.length === 1 ? [[dir, turn]] : kids.length === 2 ? [[dir, turn], [dir - 90, turn]] : [[dir, turn], [dir - 90, turn], [dir + 90, turn]];
    else if (kids.length === 1) dirs = linear(a) ? [[dir, turn]] : [[dir - 60 * turn, -turn]];
    else if (kids.length === 2) dirs = [[dir - 60 * turn, -turn], [dir + 60 * turn, turn]];
    else dirs = [[dir, turn], [dir - 90, turn], [dir + 90, -turn]];
    kids.forEach((k, i) => { const [d, t] = dirs[i]; const p = skDir(d); pos[k] = { x: pos[a].x + p.x, y: pos[a].y + p.y }; place(k, a, d, t); });
  };
  const placeRing = (k, entry, from, dir) => {
    const r = rings[k], m = r.length, R = 1 / (2 * Math.sin(Math.PI / m)), start = r.indexOf(entry);
    const c = from === null ? { x: pos[entry].x, y: pos[entry].y + R } : { x: pos[entry].x + skDir(dir, R).x, y: pos[entry].y + skDir(dir, R).y };
    const a0 = Math.atan2(pos[entry].y - c.y, pos[entry].x - c.x) / SK_RAD;
    for (let j = 0; j < m; j++) { const a = r[(start + j) % m], p = skDir(a0 + (j * 360) / m, R); if (!pos[a] || a === entry) pos[a] = { x: c.x + p.x, y: c.y + p.y }; }
    for (const a of r) {
      const out = Math.atan2(pos[a].y - c.y, pos[a].x - c.x) / SK_RAD;
      const kids = adj[a].map(b => other(b, a)).filter(x => x !== from && !pos[x]);
      const spread = kids.length === 1 ? [out] : kids.length === 2 ? (a === entry ? [out + 60, out - 60] : [out - 30, out + 30]) : [out + 60];
      kids.forEach((x, i) => {
        const d = spread[i] ?? out, p = skDir(d);
        pos[x] = { x: pos[a].x + p.x, y: pos[a].y + p.y };
        const t = level(d - 60) <= level(d + 60) ? 1 : -1;
        place(x, a, d, t);
      });
    }
  };
  // each molecule from its root: an end of its longest path (a chain then runs across the page), or its first ring
  const parts = [], seen = new Set();
  for (let a = 0; a < n; a++) {
    if (seen.has(a)) continue;
    const part = [], q = [a]; seen.add(a);
    while (q.length) { const x = q.pop(); part.push(x); for (const b of adj[x]) { const y = other(b, x); if (!seen.has(y)) { seen.add(y); q.push(y); } } }
    parts.push(part.sort((x, y) => x - y));
  }
  const far = (from, part) => { const dist = new Map([[from, 0]]), q = [from]; while (q.length) { const x = q.shift(); for (const b of adj[x]) { const y = other(b, x); if (!dist.has(y)) { dist.set(y, dist.get(x) + 1); q.push(y); } } } return part.reduce((best, x) => (dist.get(x) > dist.get(best) ? x : best), part[0]); };
  let shiftX = 0;
  for (const part of parts) {
    const ringed = part.find(a => ringOf[a] >= 0);
    const root = ringed !== undefined ? ringed : far(part[0], part);
    pos[root] = { x: 0, y: 0 };
    if (ringOf[root] >= 0) placeRing(ringOf[root], root, null, 90);
    else {
      const kids = adj[root].map(b => other(b, root));
      kids.sort((x, y) => size(y, root) - size(x, root) || x - y);
      const dirs = style === 'straight' ? [[0, 1], [180, 1], [270, 1], [90, 1]] : kids.length === 4 ? [[315, 1], [225, 1], [135, 1], [45, 1]] : [[330, -1], [210, 1], [90, 1]];
      kids.forEach((k, i) => { const [d, t] = dirs[i]; const p = skDir(d); pos[k] = { x: p.x, y: p.y }; place(k, root, d, t); });
    }
    const xs = part.map(a => pos[a].x), ys = part.map(a => pos[a].y), lo = Math.min(...xs), mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (const a of part) pos[a] = { x: pos[a].x - lo + shiftX, y: pos[a].y - mid };
    shiftX += Math.max(...xs) - lo + 2;
  }
  return pos;
}
/** Where atoms or bonds of a placed structure would overlap (two atoms closer than 0.55 of a bond, a bond through an
 *  atom, or two bonds crossing), or ''. Places in bond lengths. */
function skCrowded(atoms, bonds) {
  const P = atoms.map(a => ({ x: a.x, y: a.y }));
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if (Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y) < 0.55) return `atoms ${i + 1} and ${j + 1} would be drawn on top of each other`;
  for (const b of bonds) for (let i = 0; i < P.length; i++) if (i !== b.a && i !== b.b && ogDistanceToSegment(P[i], P[b.a], P[b.b]) < 0.25) return `a bond would be drawn through atom ${i + 1}`;
  const cross = (p, q, r, s) => { const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x); if (Math.abs(d) < 1e-9) return false; const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d, u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d; return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98; };
  for (let i = 0; i < bonds.length; i++) for (let j = i + 1; j < bonds.length; j++) {
    const x = bonds[i], y = bonds[j];
    if ([x.a, x.b].some(a => a === y.a || a === y.b)) continue;
    if (cross(P[x.a], P[x.b], P[y.a], P[y.b])) return 'two bonds would cross';
  }
  return '';
}

// ---------------------------------------------------------------- the data -> one structure
const skIdx = (v, n) => Number.isInteger(v) && v >= 1 && v <= n;
/** { s: the structure for ported/organic.js (page units), graph } or { why } (the reasons it cannot be drawn). */
function skBuild(d) {
  const forms = ['smiles', 'chain', 'atoms'].filter(k => d[k] !== undefined);
  if (forms.length !== 1) return { why: ['give one of "smiles" (SMILES-lite text), "chain" (a number of carbons) or "atoms" (with "bonds"), not more'] };
  let g, placed = null;
  if (d.atoms !== undefined) {
    const A = d.atoms, B = d.bonds;
    if (!Array.isArray(A) || !A.length || A.length > SK_MAX_ATOMS) return { why: [`"atoms" lists 1 to ${SK_MAX_ATOMS} atoms: { el: "C", x, y } (x and y in bond lengths, y up)`] };
    for (const [i, a] of A.entries()) {
      if (!a || typeof a !== 'object' || !OG_ELEMENTS.includes(a.el)) return { why: [`atom ${i + 1}: "el" must be one of ${OG_ELEMENTS.join(', ')}`] };
      if (!isNum(a.x, -40, 40) || !isNum(a.y, -40, 40)) return { why: [`atom ${i + 1}: "x" and "y" must be numbers (bond lengths, -40 to 40)`] };
      if (Object.keys(a).some(k => !['el', 'x', 'y', 'chiral', 'h'].includes(k))) return { why: [`atom ${i + 1} takes el, x, y, chiral and h only`] };
      if (a.chiral !== undefined && typeof a.chiral !== 'boolean') return { why: [`atom ${i + 1}: "chiral" must be true or false`] };
      if (a.h !== undefined && (!Array.isArray(a.h) || a.h.some(p => !Array.isArray(p) || p.length !== 2 || !isNum(p[0], -3, 3) || !isNum(p[1], -3, 3)))) return { why: [`atom ${i + 1}: "h" lists where its added hydrogens go in the full formula, [[dx, dy], ...] in bond lengths`] };
    }
    if (B !== undefined && (!Array.isArray(B) || B.length > 80 || B.some(b => !Array.isArray(b) || (b.length !== 2 && b.length !== 3) || !skIdx(b[0], A.length) || !skIdx(b[1], A.length) || b[0] === b[1] || (b.length === 3 && ![1, 2, 3].includes(b[2]))))) return { why: ['"bonds" lists [atom, atom] or [atom, atom, order]: atoms numbered from 1, order 1, 2 or 3'] };
    const bonds = (B || []).map(b => ({ a: b[0] - 1, b: b[1] - 1, order: b[2] || 1 }));
    const keys = bonds.map(b => [Math.min(b.a, b.b), Math.max(b.a, b.b)].join());
    if (new Set(keys).size !== keys.length) return { why: ['two bonds join the same two atoms: give one bond with its order'] };
    g = { atoms: A.map(a => ({ element: a.el, chiral: a.chiral === true, h: a.h })), bonds };
    placed = A.map(a => ({ x: a.x, y: -a.y }));
    for (const b of bonds) { const L = Math.hypot(placed[b.a].x - placed[b.b].x, placed[b.a].y - placed[b.b].y); if (L < 0.4 || L > 3) return { why: [`the bond from atom ${b.a + 1} to atom ${b.b + 1} is ${r2(L)} bond lengths long: keep bonds 0.4 to 3`] }; }
  } else {
    let src = d.smiles;
    if (d.chain !== undefined) {
      if (!Number.isInteger(d.chain) || d.chain < 1 || d.chain > 12) return { why: ['"chain" is how many carbons in a row, 1 to 12'] };
      for (const k of ['double', 'triple']) if (d[k] !== undefined && (!Array.isArray(d[k]) || d[k].some(x => !Number.isInteger(x) || x < 1 || x >= d.chain))) return { why: [`"${k}" lists the bonds that are ${k}: [k] is the bond from carbon k to carbon k + 1 (1 to ${Math.max(1, d.chain - 1)})`] };
      if ((d.double || []).some(x => (d.triple || []).includes(x))) return { why: ['a bond is double or triple, not both'] };
      if (d.groups !== undefined && (!Array.isArray(d.groups) || d.groups.length > 8 || d.groups.some(x => !x || !skIdx(x.at, d.chain) || !Object.prototype.hasOwnProperty.call(SK_GROUPS, x.group)))) return { why: [`"groups" lists { at: a carbon 1 to ${d.chain}, group: ${Object.keys(SK_GROUPS).join(', ')} }`] };
      src = skChainSmiles(d);
    } else {
      if (typeof src !== 'string' || !src.trim() || src.length > 200) return { why: ['"smiles" must be SMILES-lite text, at most 200 characters'] };
      for (const k of ['double', 'triple', 'groups']) if (d[k] !== undefined) return { why: [`"${k}" goes with "chain"`] };
    }
    const p = skParse(src.trim());
    if (p.error) return { why: [p.error] };
    g = p;
  }
  if (d.atoms === undefined && d.bonds !== undefined) return { why: ['"bonds" goes with "atoms"'] };
  const rings = skRings(g);
  if (!rings) return { why: ['rings that share atoms (fused, spiro or bridged) are not laid out automatically: give "atoms" with x and y, and "bonds"'] };
  if (d.atoms === undefined) {
    if (rings.some(r => r.length < 3 || r.length > 8)) return { why: ['a ring has 3 to 8 atoms'] };
    const k = skKekule(g, rings);
    if (k) return { why: [k] };
    if (d.chiral !== undefined) {
      if (!Array.isArray(d.chiral) || d.chiral.some(x => !skIdx(x, g.atoms.length))) return { why: [`"chiral" lists the atoms to mark as chiral centers, numbered from 1 in the order they are written (1 to ${g.atoms.length})`] };
      d.chiral.forEach(x => { g.atoms[x - 1].chiral = true; });
    }
    if (d.layout !== undefined && !['zigzag', 'straight'].includes(d.layout)) return { why: ['"layout" must be "zigzag" or "straight"'] };
    if (d.layout === 'straight' && rings.length) return { why: ['a straight layout is for chains without rings'] };
    const sums = g.atoms.map(() => 0);
    for (const b of g.bonds) { const o = b.order === 'a' ? 1.5 : b.order; sums[b.a] += o; sums[b.b] += o; }
    const over = g.atoms.findIndex((a, i) => sums[i] > OG_VALENCE[a.element].most);
    if (over >= 0) return { why: [`atom ${over + 1} (${g.atoms[over].element}) has more bonds than ${g.atoms[over].element} can have (${OG_VALENCE[g.atoms[over].element].most})`] };
    placed = skLayout(g, rings, d.layout || 'zigzag');
  } else {
    if (d.chiral !== undefined) return { why: ['with "atoms", mark a chiral center on the atom ({ "chiral": true })'] };
    if (d.layout !== undefined) return { why: ['"layout" is for "smiles" and "chain" (atoms are drawn where you place them)'] };
  }
  const s = { atoms: g.atoms.map((a, i) => ({ id: String(i), element: a.element, x: placed[i].x * OG_BOND, y: placed[i].y * OG_BOND, ...(a.chiral ? { chiral: true } : {}), ...(a.h ? { hydrogens: a.h.map(p => ({ x: p[0] * OG_BOND, y: -p[1] * OG_BOND })) } : {}) })),
    bonds: g.bonds.map((b, k) => ({ id: `b${k}`, a: String(b.a), b: String(b.b), order: b.order })) };
  const ob = s.atoms.find(a => ogOverbonded(s, a));
  if (ob) return { why: [`atom ${Number(ob.id) + 1} (${ob.element}) has more bonds than ${ob.element} can have (${OG_VALENCE[ob.element].most})`] };
  const crowd = skCrowded(placed, g.bonds);
  if (crowd) return { why: [`${crowd}${d.atoms === undefined ? ' in the automatic layout: give "atoms" with x and y, and "bonds"' : ': move them apart'}`] };
  return { s, rings };
}
const skSettings = d => ({ view: d.view || 'skeletal', labelEnds: d.ends === true, labelRings: d.rings !== false, acids: d.acids === true, reverseLeft: d.reverse !== false, numbering: d.numbers === true, flip: d.flip === true });

// ---------------------------------------------------------------- the answers
const SK_SUB = '₀₁₂₃₄₅₆₇₈₉';
const skSub = n => String(n).replace(/\d/g, c => SK_SUB[c]);
/** The rings of six carbons whose bonds alternate single and double (benzene rings), each once. */
function skBenzenes(s) {
  const found = new Map();
  for (const b of s.bonds) {
    const ring = ogShortestPath(s, b.a, b.b, x => x.id !== b.id);
    if (!ring || ring.length !== 6) continue;
    const bonds = ring.map((x, k) => s.bonds.find(y => (y.a === x && y.b === ring[(k + 1) % 6]) || (y.b === x && y.a === ring[(k + 1) % 6])));
    if (ring.every(x => ogAtomById(s, x).element === 'C') && bonds.every(Boolean) && bonds.every((y, k) => y.order + bonds[(k + 1) % 6].order === 3)) found.set([...ring].sort().join(), bonds);
  }
  return [...found.values()];
}
/** The functional groups, counted: alkene, alkyne, arene (a benzene ring), alcohol, ether, aldehyde, ketone,
 *  carboxylic acid, ester, amine, amide, nitrile, haloalkane, and phenol (an OH on a benzene ring). */
function skFunctional(s) {
  const out = {}, add = k => { out[k] = (out[k] || 0) + 1; };
  const el = id => ogAtomById(s, id).element, nb = id => ogNeighbors(s, id);
  const bondTo = (id, n) => ogBondsOf(s, id).find(b => ogOtherEnd(b, id) === n);
  const carbonyl = id => el(id) === 'C' && ogBondsOf(s, id).some(b => b.order === 2 && el(ogOtherEnd(b, id)) === 'O');
  const benzenes = skBenzenes(s), inBenzene = new Set(benzenes.flat());
  if (benzenes.length) out.arene = benzenes.length;
  for (const b of s.bonds) {
    const x = el(b.a), y = el(b.b);
    if (x === 'C' && y === 'C' && b.order === 3) add('alkyne');
    if (x === 'C' && y === 'C' && b.order === 2 && !inBenzene.has(b)) add('alkene');
    if (b.order === 3 && ((x === 'C' && y === 'N') || (x === 'N' && y === 'C'))) add('nitrile');
  }
  for (const a of s.atoms) {
    const id = a.id;
    if (carbonyl(id)) {
      const single = nb(id).filter(n => bondTo(id, n.id).order === 1);
      if (single.some(n => n.element === 'O' && ogBondsOf(s, n.id).length === 1)) add('carboxylicAcid');
      else if (single.some(n => n.element === 'O')) add('ester');
      else if (single.some(n => n.element === 'N')) add('amide');
      else if (single.filter(n => n.element === 'C' || n.element === 'R').length >= 2) add('ketone');
      else add('aldehyde');
    }
    if (a.element === 'O' && ogBondsOf(s, id).every(b => b.order === 1)) {
      const ns = nb(id);
      if (ns.length === 1 && ns[0].element === 'C' && !carbonyl(ns[0].id)) add(ogBondsOf(s, ns[0].id).some(x => inBenzene.has(x)) ? 'phenol' : 'alcohol');
      if (ns.length === 2 && ns.every(n => n.element === 'C' && !carbonyl(n.id))) add('ether');
    }
    if (a.element === 'N' && ogBondsOf(s, id).every(b => b.order === 1) && nb(id).some(n => n.element === 'C') && !nb(id).some(n => carbonyl(n.id))) add('amine');
    if (['F', 'Cl', 'Br', 'I'].includes(a.element) && nb(id).some(n => n.element === 'C')) add('haloalkane');
  }
  return out;
}
/** The formula, counts and mass of a structure. */
function skNumbers(s) {
  const atoms = {};
  for (const a of s.atoms) { atoms[a.element] = (atoms[a.element] || 0) + 1; const h = ogAddedHydrogens(s, a); if (h) atoms.H = (atoms.H || 0) + h; }
  const hill = (p, q) => (atoms.C ? (p === 'C' ? -1 : q === 'C' ? 1 : p === 'H' ? -1 : q === 'H' ? 1 : 0) : 0);
  const order = Object.keys(atoms).sort((p, q) => hill(p, q) || (hill(q, p) ? 0 : p < q ? -1 : p > q ? 1 : 0));
  const formula = order.map(e => `${e}${atoms[e] > 1 ? skSub(atoms[e]) : ''}`).join('');
  const groupsR = (atoms.R || 0) + (atoms.X || 0);
  const mass = groupsR ? null : Math.round(order.reduce((m, e) => m + SK_MASS[e] * atoms[e], 0) * 1000) / 1000;
  const halo = ['F', 'Cl', 'Br', 'I'].reduce((t, e) => t + (atoms[e] || 0), 0);
  const unsat = groupsR || atoms.S || atoms.P ? null : (2 * (atoms.C || 0) + 2 + (atoms.N || 0) - (atoms.H || 0) - halo) / 2;
  const rings = s.bonds.length - s.atoms.length + ogParts(s).length;
  return { formula, atoms: Object.fromEntries(order.map(e => [e, atoms[e]])), carbons: atoms.C || 0, hydrogens: atoms.H || 0, mass, unsaturation: unsat, rings, bonds: s.bonds.length, double: s.bonds.filter(b => b.order === 2).length, triple: s.bonds.filter(b => b.order === 3).length };
}

/**
 * { smiles: "CC(=O)O" (SMILES-lite: C N O S P F Cl Br I, R and X for any group, c and n in aromatic rings of six,
 * branches, - = #, ring digits 1 to 9, "." between molecules) | chain: 5 (carbons in a row) with double?: [2], triple?:
 * [k] (the bond from carbon k to k + 1) and groups?: [{ at: 2, group: "OH" | "NH2" | "F" | "Cl" | "Br" | "I" | "CH3" |
 * "C2H5" | "=O" }] | atoms: [{ el: "C", x: 0, y: 0, chiral?, h? }] (x, y in bond lengths, y up) with bonds: [[1, 2, 2]],
 * view?: "skeletal" | "carbons" | "condensed" | "full", layout?: "zigzag" | "straight" (a chain's shape), ends?: true
 * (CH3 at a skeletal chain's ends), rings?: false (ring carbons bare in the other views), acids?: true (CO2H), reverse?:
 * false (no H3C, HO), numbers?: true (carbon numbering), flip?: true (from the other end), chiral?: [atoms], name?:
 * "Ethanoic acid", formula?: true (the molecular formula under it) }. hide: "name", "formula", true (both).
 */
export const skeletal = {
  check(d) {
    const odd = Object.keys(d).filter(k => !SK_KEYS.includes(k));
    if (odd.length) return [`an organic structure does not take "${odd[0]}"`];
    const out = [];
    if (d.view !== undefined && !SK_VIEWS.includes(d.view)) out.push(`"view" must be ${SK_VIEWS.join(', ')}`);
    for (const k of ['ends', 'rings', 'acids', 'reverse', 'numbers', 'flip', 'formula']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
    if (d.flip !== undefined && d.numbers !== true) out.push('"flip" goes with "numbers": true');
    if (d.ends !== undefined && (d.view || 'skeletal') !== 'skeletal') out.push('"ends" (CH₃ at a chain\'s ends) is for the skeletal formula');
    if (d.name !== undefined && (typeof d.name !== 'string' || !text(d.name, 60))) out.push('"name" must be a short caption (at most 60 characters)');
    if (out.length) return out;
    const b = skBuild(d);
    if (b.why) return b.why;
    const st = skSettings(d), v = ogDrawView(b.s, st);
    if (v.hidden.length) return [`in a skeletal formula, carbon ${Number(v.hidden[0]) + 1} would be hidden in a straight line: draw its bonds at an angle (layout "zigzag"), or use another view`];
    if (st.numbering && v.numberingNote) return ['carbon numbering is not worked out for two rings, or a ring with N or O in it: leave "numbers" off'];
    return [];
  },
  /** The molecular formula (text), each element's count (atoms.C, atoms.H, ...), carbons, hydrogens, the molar mass
   *  (g/mol; none with R or X), the degree of unsaturation, rings, double and triple bonds, the functional groups. */
  solve(d) {
    if (skeletal.check(d).length) return null;
    const b = skBuild(d), out = skNumbers(b.s);
    out.groups = skFunctional(b.s);
    if (d.numbers) { const v = ogDrawView(b.s, skSettings(d)); out.numbered = v.numbers.length; }
    return out;
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), b = skBuild(d), st = skSettings(d), v = ogDrawView(b.s, st);
    const ink = P.ink, colour = el => (o.print ? '#000000' : { O: P.red, N: P.blue, S: P.gold, P: P.gold, F: P.green, Cl: P.green, Br: P.green, I: P.purple }[el] || ink);
    const elOf = id => (id === null ? 'H' : ogAtomById(b.s, id).element);
    // the extent of what is drawn, in page units
    const rects = [...v.labels.map(l => l.box), ...v.numbers.map(ogNumberBox), ...v.stars.map(ogStarBox),
      ...v.bonds.flatMap(x => x.lines.flatMap(l => [{ x: l.x1, y: l.y1, width: 0, height: 0 }, { x: l.x2, y: l.y2, width: 0, height: 0 }])), ...b.s.atoms.map(a => ({ x: a.x, y: a.y, width: 0, height: 0 }))];
    const pad = 22, minW = 180;
    let x0 = Math.min(...rects.map(r => r.x)) - pad, x1 = Math.max(...rects.map(r => r.x + r.width)) + pad;
    const y0 = Math.min(...rects.map(r => r.y)) - pad;
    let y1 = Math.max(...rects.map(r => r.y + r.height)) + pad;
    if (x1 - x0 < minW) { const m = (x0 + x1) / 2; x0 = m - minW / 2; x1 = m + minW / 2; }
    const name = text(d.name, 60), nums = d.formula === true ? skNumbers(b.s).formula : '', lines = [];
    if (name) lines.push([hides(o, 'name') || o.hide === true ? '________________' : name, hides(o, 'name') || o.hide === true]);
    if (nums) lines.push([hides(o, 'formula') || o.hide === true ? '________' : nums, hides(o, 'formula') || o.hide === true]);
    const capY = y1 + 4;
    y1 += lines.length * 30;
    const T = (x, y) => [r2(x - x0), r2(y - y0)];
    const kids = [];
    for (const x of v.bonds) for (const l of x.lines) { const [ax, ay] = T(l.x1, l.y1), [bx, by] = T(l.x2, l.y2); kids.push(node('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: ink, 'stroke-width': 2.5, 'stroke-linecap': 'round', class: x.bondId ? 'of-bond' : 'of-hbond' })); }
    for (const l of v.labels) {
      const [lx, ly] = T(l.x, l.y), fill = colour(elOf(l.atomId));
      const tspans = l.runs.map((r, j) => { const prev = l.runs[j - 1], dy = r.sub === !!(prev && prev.sub) ? 0 : r.sub ? OG_SUB_DROP : -OG_SUB_DROP; return node('tspan', { 'font-size': r.sub ? r2(OG_SUB_FONT) : null, dy: dy ? r2(dy) : null }, r.text); });
      kids.push(node('text', { x: lx, y: ly, dy: '0.35em', 'font-size': OG_FONT, fill, class: l.atomId === null ? 'of-h' : 'of-atom' }, tspans));
    }
    for (const n of v.numbers) { const [nx, ny] = T(n.x, n.y); kids.push(node('text', { x: nx, y: ny, dy: '0.35em', 'text-anchor': 'middle', 'font-size': OG_NUMBER_FONT, fill: o.print ? '#000000' : P.blue, class: 'of-number' }, String(n.n))); }
    for (const s of v.stars) { const [sx, sy] = T(s.x, s.y); kids.push(node('text', { x: sx, y: sy, dy: '0.35em', 'text-anchor': 'middle', 'font-size': OG_STAR_FONT, fill: ink, class: 'of-star' }, '*')); }
    lines.forEach(([t, blank], i) => kids.push(node('text', { x: r2((x1 - x0) / 2), y: r2(capY - y0 + 18 + i * 30), 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 600, fill: ink, class: blank ? 'of-blank' : i === 0 && name ? 'of-name' : 'of-formula' }, t)));
    const w = x1 - x0, h = y1 - y0;
    const nameOf = name && !(hides(o, 'name') || o.hide === true) ? name : W(st.view === 'skeletal' ? 'skeletalFormula' : st.view === 'carbons' ? 'carbonSkeleton' : st.view === 'condensed' ? 'condensedFormula' : 'fullFormula');
    return frame(w, h, node('g', { 'font-family': 'Arial, Helvetica, sans-serif', 'font-weight': 400 }, kids), { ...o, kind: 'skeletal', width: o.width || Math.round(w * 0.62) }, o.title || nameOf);
  },
};
