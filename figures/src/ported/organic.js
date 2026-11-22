// Oomba Figures: how an organic structure is shown, from one drawing of it. The structure is its carbons and other
// atoms (no hydrogens on them), its bonds, and where each atom sits; every view keeps that shape and moves no atom. Each
// atom's hydrogens are worked out from its usual valence. The skeletal formula hides the carbons (a chain's CH3 ends
// can be labeled), the carbon skeleton writes each carbon as C, the condensed formula writes each atom with its
// hydrogens (CH3, CH2, OH; written backward, H3C, HO, when its bonds all come from the right), and the full structural
// formula draws every added hydrogen as an atom, spread evenly round its atom on 30 degree steps and clear of the rest.
// A double bond's second line goes inside its ring, or toward the side with more neighbors; a carboxylic acid group can
// be written CO2H; a chiral center is marked with an asterisk; and the carbons can be numbered the way high school
// naming does (a ring round from its substituents; otherwise the chain through the principal group, or the longest
// chain, from the end nearest the C=O, the O or N, a double or triple bond, then a branch). Pure numbers in, plain
// lines and text runs out (page units: a bond is 70 long, labels 24 high): figures/src/skeletal.js draws them.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; an atom's id is its index as text; the editor's pointer work (adding,
// dropping, growing, moving, swinging and deleting atoms, rings and bonds, the page and its margins, reading back from
// browser storage) is left out, as are the editor's marks, the export crop and the description for screen readers
// (Oomba lays out, checks and names the figure itself); the numbering note is a flag, not English words.

/** Each element's usual valence, which added hydrogens fill, and the most bonds it can have before it is overbonded (S
 *  and P can expand theirs). R and X, any group, take one bond and never get hydrogens. */
export const OG_VALENCE = {
  C: { usual: 4, most: 4 }, H: { usual: 1, most: 1 }, O: { usual: 2, most: 2 }, N: { usual: 3, most: 3 },
  S: { usual: 2, most: 6 }, P: { usual: 3, most: 5 }, F: { usual: 1, most: 1 }, Cl: { usual: 1, most: 1 },
  Br: { usual: 1, most: 1 }, I: { usual: 1, most: 1 }, X: { usual: 0, most: 1 }, R: { usual: 0, most: 1 },
};
export const OG_ELEMENTS = Object.keys(OG_VALENCE);
/** Every bond is drawn this long; a drawn C-H a little shorter. */
export const OG_BOND = 70;
export const OG_H_BOND = OG_BOND * 0.8;
/** Text sizes: atom symbols, their subscripts, carbon numbers; and how far a subscript sits below the baseline. */
export const OG_FONT = 24;
export const OG_SUB_FONT = OG_FONT * 0.7;
export const OG_SUB_DROP = OG_FONT * 0.25;
export const OG_NUMBER_FONT = 15;
export const OG_STAR_FONT = OG_FONT;
const OG_STAR_GAP = 13;
const OG_LINE_GAP = 7;
const OG_INSET = OG_BOND * 0.14;
const OG_LABEL_PAD = 3;
const OG_RAD = Math.PI / 180;

/** A direction in whole degrees from 0 to 359: 0 to the right, 90 down the page. */
export const ogDegrees = (dx, dy) => ((Math.round(Math.atan2(dy, dx) / OG_RAD) % 360) + 360) % 360;
/** The point a distance from another in a direction. */
export const ogStep = (p, angle, length = OG_BOND) => ({ x: p.x + length * Math.cos(angle * OG_RAD), y: p.y + length * Math.sin(angle * OG_RAD) });
/** How far apart two directions are, from 0 to 180. */
export const ogTurn = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
export const ogAtomById = (s, id) => s.atoms.find(a => a.id === id);
export const ogBondBetween = (s, a, b) => s.bonds.find(bond => (bond.a === a && bond.b === b) || (bond.a === b && bond.b === a));
export const ogBondsOf = (s, id) => s.bonds.filter(b => b.a === id || b.b === id);
export const ogOtherEnd = (bond, id) => (bond.a === id ? bond.b : bond.a);
export const ogNeighbors = (s, id) => ogBondsOf(s, id).map(b => ogAtomById(s, ogOtherEnd(b, id))).filter(Boolean);
/** The directions an atom's bonds leave it in. */
export const ogBondAngles = (s, atom) => ogNeighbors(s, atom.id).map(n => ogDegrees(n.x - atom.x, n.y - atom.y));
export const ogBondSum = (s, id) => ogBondsOf(s, id).reduce((n, b) => n + b.order, 0);
/** Whether an atom has more bonds than its element can have. */
export const ogOverbonded = (s, atom) => ogBondSum(s, atom.id) > OG_VALENCE[atom.element].most;
/** The hydrogens added to an atom: its usual valence less its bonds (a hydrogen drawn counts as one), never below none. */
export function ogAddedHydrogens(s, atom) {
  if (atom.element === 'H') return 0;
  return Math.max(0, OG_VALENCE[atom.element].usual - ogBondSum(s, atom.id));
}
/** How far a point is from the segment between two points. */
export function ogDistanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
/** Every atom joined to one through bonds, itself included. */
export function ogConnectedTo(s, id) {
  const seen = new Set([id]), queue = [id];
  while (queue.length) {
    const at = queue.pop();
    for (const b of ogBondsOf(s, at)) { const other = ogOtherEnd(b, at); if (!seen.has(other)) { seen.add(other); queue.push(other); } }
  }
  return [...seen];
}
/** Each separate structure on the page, as its atoms' ids. */
export function ogParts(s) {
  const seen = new Set(), found = [];
  for (const a of s.atoms) {
    if (seen.has(a.id)) continue;
    const part = ogConnectedTo(s, a.id);
    for (const id of part) seen.add(id);
    found.push(part);
  }
  return found;
}
/** The shortest path of atoms between two, through bonds a test allows, or null if there is none. */
export function ogShortestPath(s, from, to, allow = () => true) {
  const prev = new Map([[from, null]]), queue = [from];
  while (queue.length && !prev.has(to)) {
    const at = queue.shift();
    for (const b of ogBondsOf(s, at)) { const n = ogOtherEnd(b, at); if (!prev.has(n) && allow(b, n)) { prev.set(n, at); queue.push(n); } }
  }
  if (!prev.has(to)) return null;
  const p = [to];
  while (prev.get(p[0])) p.unshift(prev.get(p[0]));
  return p;
}

// ---------------------------------------------------------------- labels
/** Arial's widths, in ems, for the letters labels use; anything else is a digit. */
const OG_EM = { '*': 0.389, C: 0.722, H: 0.722, O: 0.778, N: 0.722, S: 0.667, P: 0.667, F: 0.611, B: 0.667, I: 0.278, R: 0.722, X: 0.667, l: 0.222, r: 0.333 };
const ogRunWidth = r => [...r.text].reduce((w, c) => w + (OG_EM[c] ?? 0.556), 0) * (r.sub ? OG_SUB_FONT : OG_FONT);
const OG_CAP = OG_FONT * 0.36;
/** Text for a count: nothing for none, the letters alone for one, else with a subscript. */
const ogCounted = (t, n) => (n === 0 ? [] : n === 1 ? [{ text: t, sub: false }] : [{ text: t, sub: false }, { text: String(n), sub: true }]);
const OG_STAR = { text: '*', sub: false };
/** Runs split into groups, each letters and the subscript after them. */
const ogGroups = runs => runs.reduce((g, r) => (r.sub && g.length ? g[g.length - 1].push(r) : g.push([r]), g), []);
/** An atom's label: its symbol, then what follows it (hydrogens, or O2H for an acid group), written before it instead
 *  when it faces backward. A chiral center's asterisk goes in front (*CH), or after when backward. */
function ogMakeLabel(atomId, at, element, hydrogens, backward, chiral = false, follows = ogCounted('H', hydrogens)) {
  const symbol = { text: element, sub: false }, star = chiral ? [OG_STAR] : [];
  const ahead = backward ? ogGroups(follows).reverse().flat() : star;
  const runs = backward ? [...ahead, symbol, ...star] : [...ahead, symbol, ...follows];
  const before = ahead.reduce((w, r) => w + ogRunWidth(r), 0);
  const x = at.x - before - ogRunWidth(symbol) / 2, width = runs.reduce((w, r) => w + ogRunWidth(r), 0);
  const bottom = runs.some(r => r.sub) ? OG_SUB_DROP + OG_SUB_FONT * 0.36 : OG_CAP;
  return { atomId, x, y: at.y, runs, text: runs.map(r => r.text).join(''), box: { x: x - OG_LABEL_PAD, y: at.y - OG_CAP - OG_LABEL_PAD, width: width + 2 * OG_LABEL_PAD, height: OG_CAP + bottom + 2 * OG_LABEL_PAD } };
}
/** How many hydrogens an atom's label writes, or null for no label. */
function ogLabelHydrogens(s, atom, st) {
  const view = st.view;
  if (ogBareRingCarbon(s, atom, st)) return null;
  if (atom.element === 'H' || view === 'full') return 0;
  const hs = ogAddedHydrogens(s, atom);
  if (atom.element !== 'C' || view === 'condensed') return hs;
  if (view === 'carbons') return 0;
  const bonds = ogBondsOf(s, atom.id);
  if (!bonds.length) return hs;
  if (st.labelEnds && bonds.length === 1 && bonds[0].order === 1 && hs === 3) return hs;
  return null;
}
/** Each carboxylic acid group's carbon, with its two oxygens: a carbon with three bonds, one double to an O and one
 *  single to an O, neither O bonded to anything else. */
export function ogAcidGroups(s) {
  const found = new Map();
  for (const atom of s.atoms) {
    const bonds = ogBondsOf(s, atom.id);
    if (atom.element !== 'C' || bonds.length !== 3) continue;
    const lone = order => bonds.map(b => (b.order === order ? ogAtomById(s, ogOtherEnd(b, atom.id)) : undefined)).find(o => o && o.element === 'O' && ogBondsOf(s, o.id).length === 1);
    const dbl = lone(2), sgl = lone(1);
    if (dbl && sgl) found.set(atom.id, [dbl.id, sgl.id]);
  }
  return found;
}
/** Whether an atom is in a ring: one of its bonds has another way round. */
export const ogInRing = (s, atom) => ogBondsOf(s, atom.id).some(bond => ogShortestPath(s, bond.a, bond.b, b => b.id !== bond.id));
/** Whether a view draws a carbon as a bare ring corner, as the skeletal formula does, because ring labels are off. */
const ogBareRingCarbon = (s, atom, st) => !st.labelRings && st.view !== 'skeletal' && atom.element === 'C' && ogInRing(s, atom);
/** Whether the skeletal formula hides a carbon: two bonds in a straight line, unless it is an alkyne's or allene's. */
export function ogIsHidden(s, atom) {
  if (atom.element !== 'C') return false;
  const bonds = ogBondsOf(s, atom.id);
  if (bonds.length !== 2 || bonds.some(b => b.order === 3) || bonds.every(b => b.order === 2)) return false;
  const [a, b] = ogBondAngles(s, atom);
  return ogTurn(a, b) > 175;
}
/** Where a line from p toward q leaves a box p is in (p itself if it is not). */
function ogLeaveBox(p, q, box) {
  if (!box) return p;
  const dx = q.x - p.x, dy = q.y - p.y;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (box.x + box.width - p.x) / dx);
  if (dx < 0) t = Math.min(t, (box.x - p.x) / dx);
  if (dy > 0) t = Math.min(t, (box.y + box.height - p.y) / dy);
  if (dy < 0) t = Math.min(t, (box.y - p.y) / dy);
  t = Math.max(0, Math.min(1, t));
  return { x: p.x + dx * t, y: p.y + dy * t };
}
/** The middle of the smallest ring a bond is in, or null if it is in none. */
function ogRingCenter(s, bond) {
  const ids = ogShortestPath(s, bond.a, bond.b, b => b.id !== bond.id);
  if (!ids) return null;
  const ring = ids.map(id => ogAtomById(s, id));
  return { x: ring.reduce((t, a) => t + a.x, 0) / ring.length, y: ring.reduce((t, a) => t + a.y, 0) / ring.length };
}
function ogBondLines(s, bond, boxes) {
  const a = ogAtomById(s, bond.a), b = ogAtomById(s, bond.b);
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / length, uy = (b.y - a.y) / length, nx = -uy, ny = ux;
  const boxA = boxes.get(a.id), boxB = boxes.get(b.id);
  const ln = (offset, inset = false) => {
    const p = ogLeaveBox({ x: a.x + nx * offset, y: a.y + ny * offset }, { x: b.x + nx * offset, y: b.y + ny * offset }, boxA);
    const q = ogLeaveBox({ x: b.x + nx * offset, y: b.y + ny * offset }, p, boxB);
    const inA = inset && !boxA ? OG_INSET : 0, inB = inset && !boxB ? OG_INSET : 0;
    return { x1: p.x + ux * inA, y1: p.y + uy * inA, x2: q.x - ux * inB, y2: q.y - uy * inB };
  };
  if (bond.order === 1) return [ln(0)];
  if (bond.order === 3) return [ln(-OG_LINE_GAP), ln(0), ln(OG_LINE_GAP)];
  // A double bond between two labels is centered. Otherwise its second line goes inside its ring, or toward the side
  // with more neighbors.
  const centered = [ln(-OG_LINE_GAP / 2), ln(OG_LINE_GAP / 2)];
  if (boxA && boxB) return centered;
  const sideOf = p => Math.sign((p.x - a.x) * nx + (p.y - a.y) * ny);
  const center = ogRingCenter(s, bond);
  let side = center ? sideOf(center) : 0;
  if (!center) {
    const others = [...ogNeighbors(s, a.id).filter(n => n.id !== b.id), ...ogNeighbors(s, b.id).filter(n => n.id !== a.id)];
    side = Math.sign(others.reduce((t, n) => t + sideOf(n), 0));
  }
  return side ? [ln(0), ln(side * OG_LINE_GAP, true)] : centered;
}
/** The directions for an atom's added hydrogens, on 30 degree steps: spread as evenly as they can be among its bonds,
 *  so a straight chain's go straight up and down, and away from anything else drawn where there is a choice. */
function ogHydrogenAngles(taken, count, crowded) {
  const open = Array.from({ length: 12 }, (_, i) => i * 30).filter(a => taken.every(t => ogTurn(t, a) > 1));
  const gaps = angles => { const sorted = [...angles].sort((p, q) => p - q); return sorted.map((a, i) => (i + 1 < sorted.length ? sorted[i + 1] - a : sorted[0] + 360 - a)).sort((p, q) => p - q); };
  const busy = new Set(open.filter(crowded));
  const score = picked => [-picked.filter(a => busy.has(a)).length, ...gaps([...taken, ...picked])];
  let best = [], bestScore = null;
  const choose = (from, picked) => {
    if (picked.length === count) {
      const g = score(picked), i = bestScore ? g.findIndex((x, k) => x !== bestScore[k]) : 0;
      if (!bestScore || (i >= 0 && g[i] > bestScore[i])) { best = picked; bestScore = g; }
      return;
    }
    for (let k = from; k < open.length; k++) choose(k + 1, [...picked, open[k]]);
  };
  choose(0, []);
  return best;
}
const ogOverlaps = (p, q) => p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
/** The 15 degree direction from an atom furthest from everything leaving it. */
function ogOpenTurn(taken) {
  if (!taken.length) return 45;
  const angles = Array.from({ length: 24 }, (_, i) => i * 15);
  return angles.reduce((p, q) => (Math.min(...taken.map(t => ogTurn(t, q))) > Math.min(...taken.map(t => ogTurn(t, p))) ? q : p));
}
export function ogNumberBox(n) {
  const width = String(n.n).length * OG_NUMBER_FONT * 0.556, height = OG_NUMBER_FONT * 0.72;
  return { x: n.x - width / 2, y: n.y - height / 2, width, height };
}
export function ogStarBox(st) { const width = OG_STAR_FONT * 0.389; return { x: st.x - width / 2, y: st.y - OG_STAR_FONT * 0.36, width, height: OG_STAR_FONT * 0.72 }; }

/**
 * One view of a structure { atoms: [{ id, element, x, y, hydrogens?: [{ x, y }] (where the full formula draws its
 * added hydrogens, from the atom), chiral? }], bonds: [{ id, a, b, order }] }, with settings { view: 'skeletal' |
 * 'carbons' | 'condensed' | 'full', labelEnds, labelRings, acids, reverseLeft, numbering, flip }: { bonds: [{ bondId,
 * lines }], labels: [{ atomId, x, y, runs, text, box }], numbers, stars, hidden, numberingNote }.
 */
export function ogDrawView(s, st) {
  const acids = st.acids && (st.view === 'condensed' || st.view === 'carbons') ? ogAcidGroups(s) : new Map();
  const inAcid = new Set([...acids.values()].flat());
  const labels = [], boxes = new Map();
  let leftLabels = false;
  for (const atom of s.atoms) {
    if (inAcid.has(atom.id)) continue;
    const hs = ogLabelHydrogens(s, atom, st);
    if (hs === null) continue;
    const near = ogNeighbors(s, atom.id).filter(n => !inAcid.has(n.id));
    const follows = acids.has(atom.id) ? [...ogCounted('O', 2), ...ogCounted('H', 1)] : undefined;
    const facesLeft = near.length > 0 && near.every(n => n.x > atom.x + 1);
    leftLabels = leftLabels || (facesLeft && (hs > 0 || !!follows));
    const lab = ogMakeLabel(atom.id, atom, atom.element, hs, facesLeft && st.reverseLeft, !!atom.chiral, follows);
    labels.push(lab); boxes.set(atom.id, lab.box);
  }
  const bonds = s.bonds.filter(b => !inAcid.has(b.a) && !inAcid.has(b.b)).map(b => ({ bondId: b.id, lines: ogBondLines(s, b, boxes) }));
  // The full structural formula draws each added hydrogen as an atom: where it was placed, or else spread out round the
  // atom, clear of the rest (placed ones first, so the others keep clear of them).
  const hydrogenTurns = new Map();
  if (st.view === 'full') {
    const byId = new Map(s.atoms.map(a => [a.id, a]));
    const counts = new Map(s.atoms.map(a => [a.id, ogBareRingCarbon(s, a, st) ? 0 : ogAddedHydrogens(s, a)]));
    const kept = atom => (atom.hydrogens && atom.hydrogens.length === counts.get(atom.id) ? atom.hydrogens : null);
    const placed = s.atoms.flatMap(a => (kept(a) || []).map(p => ({ x: a.x + p.x, y: a.y + p.y })));
    for (const atom of s.atoms) {
      const count = counts.get(atom.id);
      if (!count) continue;
      const drawHydrogen = end => {
        const h = ogMakeLabel(null, end, 'H', 0, false);
        labels.push(h);
        const p = ogLeaveBox(atom, end, boxes.get(atom.id)), q = ogLeaveBox(end, atom, h.box);
        bonds.push({ bondId: null, lines: [{ x1: p.x, y1: p.y, x2: q.x, y2: q.y }] });
      };
      const own = kept(atom);
      if (own) { hydrogenTurns.set(atom.id, own.map(p => ogDegrees(p.x, p.y))); own.forEach(p => drawHydrogen({ x: atom.x + p.x, y: atom.y + p.y })); continue; }
      const crowded = angle => {
        const end = ogStep(atom, angle, OG_H_BOND);
        return s.atoms.some(a => a.id !== atom.id && Math.hypot(a.x - end.x, a.y - end.y) < OG_BOND * 0.6)
          || placed.some(p => Math.hypot(p.x - end.x, p.y - end.y) < OG_BOND * 0.5)
          || s.bonds.some(b => b.a !== atom.id && b.b !== atom.id && ogDistanceToSegment(end, byId.get(b.a), byId.get(b.b)) < OG_BOND * 0.3);
      };
      const angles = ogHydrogenAngles(ogBondAngles(s, atom), count, crowded);
      hydrogenTurns.set(atom.id, angles);
      angles.forEach(angle => { const end = ogStep(atom, angle, OG_H_BOND); placed.push(end); drawHydrogen(end); });
    }
  }
  // A chiral center with no label gets its asterisk in the open beside it.
  const turnsAt = atom => [...ogBondAngles(s, atom), ...(hydrogenTurns.get(atom.id) || [])];
  const stars = [];
  for (const atom of s.atoms) {
    if (!atom.chiral || boxes.has(atom.id) || inAcid.has(atom.id)) continue;
    const angle = ogOpenTurn(turnsAt(atom));
    stars.push({ atomId: atom.id, ...ogStep(atom, angle, OG_STAR_GAP) });
    hydrogenTurns.set(atom.id, [...(hydrogenTurns.get(atom.id) || []), angle]);
  }
  const numbers = [];
  let numberingNote = false;
  if (st.numbering) {
    const found = ogCarbonNumbers(s, st.flip);
    numberingNote = found.note;
    for (const [atomId, n] of found.numbers) {
      const atom = ogAtomById(s, atomId), angle = ogOpenTurn(turnsAt(atom)), box = boxes.get(atomId);
      let d = 13;
      while (box && d < 60 && ogOverlaps(ogNumberBox({ ...ogStep(atom, angle, d), n }), box)) d += 2;
      numbers.push({ atomId, n, ...ogStep(atom, angle, d) });
    }
  }
  return { bonds, labels, numbers, stars, leftLabels, numberingNote, overbonded: s.atoms.filter(a => ogOverbonded(s, a)).map(a => a.id), hidden: st.view === 'skeletal' ? s.atoms.filter(a => ogIsHidden(s, a)).map(a => a.id) : [] };
}

// ---------------------------------------------------------------- carbon numbering
/** Lists compared from the front, the lower first difference winning. */
function ogCompareLocants(a, b) { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
/** The atoms of a part's one ring, in order round it: what is left after pruning every chain back to the ring. */
function ogCycleOf(s, part) {
  const degree = new Map(part.map(id => [id, ogBondsOf(s, id).length])), left = new Set(part), queue = part.filter(id => degree.get(id) <= 1);
  while (queue.length) {
    const id = queue.pop();
    if (!left.delete(id)) continue;
    for (const n of ogNeighbors(s, id)) if (left.has(n.id)) { degree.set(n.id, degree.get(n.id) - 1); if (degree.get(n.id) <= 1) queue.push(n.id); }
  }
  const [first] = left, cycle = [first];
  for (let prev = null; ;) {
    const at = cycle[cycle.length - 1], next = ogNeighbors(s, at).find(n => left.has(n.id) && n.id !== prev && n.id !== first);
    if (!next) break;
    prev = at; cycle.push(next.id);
  }
  return cycle;
}
/** { numbers: Map(atom id -> its number), note: true when two rings, or a ring with N or O in it, were not numbered }. */
export function ogCarbonNumbers(s, flip) {
  const numbers = new Map();
  let note = false;
  const element = id => ogAtomById(s, id).element;
  const isCarbonyl = id => ogBondsOf(s, id).some(b => b.order === 2 && element(ogOtherEnd(b, id)) === 'O');
  const toOorN = id => ogNeighbors(s, id).some(n => n.element === 'O' || n.element === 'N');
  /** The positions, from 1, of what each rule looks at along an order. */
  function locants(order, closed, aromatic) {
    const along = new Set(order), at = test => order.flatMap((id, i) => (test(id) ? [i + 1] : []));
    const multiple = aromatic ? [] : order.flatMap((id, i) => { const next = order[i + 1] ?? (closed ? order[0] : undefined); return next && ((ogBondBetween(s, id, next) || {}).order ?? 1) > 1 ? [i + 1] : []; });
    const branches = order.flatMap((id, i) => ogNeighbors(s, id).filter(n => !along.has(n.id) && n.element !== 'H').map(() => i + 1));
    return [at(isCarbonyl), at(toOorN), multiple, branches];
  }
  const better = (a, b) => { for (let i = 0; i < a.length; i++) { const c = ogCompareLocants(a[i], b[i]); if (c) return c < 0; } return false; };
  function chain(part) {
    const carbons = part.filter(id => element(id) === 'C');
    const carbonNeighbors = id => ogNeighbors(s, id).filter(n => n.element === 'C').map(n => n.id);
    const ends = carbons.filter(id => carbonNeighbors(id).length <= 1);
    const pathBetween = (from, to) => ogShortestPath(s, from, to, (_, next) => element(next) === 'C');
    const paths = [];
    for (let i = 0; i < ends.length; i++) for (let j = i; j < ends.length; j++) {
      if (i === j && carbonNeighbors(ends[i]).length) continue;
      const p = pathBetween(ends[i], ends[j]);
      if (p) paths.push(p);
    }
    const rank = p => { const [carbonyl, oOrN, multiple, branches] = locants(p, false, false); return [+!!carbonyl.length, +!!oOrN.length, p.length, multiple.length, branches.length]; };
    const best = paths.reduce((p, q) => (ogCompareLocants(rank(q), rank(p)) > 0 ? q : p));
    const back = [...best].reverse();
    return better(locants(back, false, false), locants(best, false, false)) ? back : best;
  }
  function ring(cycle) {
    const n = cycle.length, aromatic = n === 6 && cycle.filter((id, i) => (ogBondBetween(s, id, cycle[(i + 1) % n]) || {}).order === 2).length === 3;
    // Start at the top atom and go clockwise round the page, so an unsubstituted ring numbers the same way every time.
    const points = cycle.map(id => ogAtomById(s, id));
    const area = points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % n].y - points[(i + 1) % n].x * p.y, 0);
    const round = area > 0 ? cycle : [...cycle].reverse();
    const top = round.reduce((best, id, i) => { const p = ogAtomById(s, id), q = ogAtomById(s, round[best]); return p.y < q.y - 0.5 || (Math.abs(p.y - q.y) <= 0.5 && p.x < q.x) ? i : best; }, 0);
    let best = null;
    for (const dir of [1, -1]) for (let k = 0; k < n; k++) {
      const order = Array.from({ length: n }, (_, i) => round[(((top + k + dir * i) % n) + n) % n]);
      if (!best || better(locants(order, true, aromatic), locants(best, true, aromatic))) best = order;
    }
    return best;
  }
  for (const part of ogParts(s)) {
    if (!part.some(id => element(id) === 'C')) continue;
    const inPart = new Set(part), rings = s.bonds.filter(b => inPart.has(b.a)).length - part.length + 1;
    let order;
    if (rings >= 2) { note = true; continue; } else if (rings === 1) {
      const cycle = ogCycleOf(s, part);
      if (cycle.some(id => element(id) !== 'C')) { note = true; continue; }
      order = ring(cycle);
      if (flip) order = [order[0], ...order.slice(1).reverse()];
    } else {
      order = chain(part);
      if (flip) order = [...order].reverse();
    }
    order.forEach((id, i) => numbers.set(id, i + 1));
  }
  return { numbers, note };
}
