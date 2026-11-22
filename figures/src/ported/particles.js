// Oomba Figures: where the particles of a particle diagram go. A particle is a disc alone (an atom or ion) or a center
// with one to four outer discs touching it (pair, bent at water's 104.5 degrees, in a line, three around, four around),
// each disc a size and a shade. In a box they are arranged for their state: scattered at random without touching for a
// gas, settled close together but jumbled at the bottom for a liquid, packed in rows at the bottom for a solid; or in a
// lattice, a square grid of atoms or ions (pure, alternating, with some swapped for a second kind, or with a second kind
// in the gaps), spaced so the closest pairs just touch. The randomness comes only from a seed (mulberry32), and the
// sums are rounded to thousandths, so a link redraws the same figure and the server draws what the browser will. A
// particle that finds no room is counted as missing. Pure numbers in, pure numbers out: figures/src/particles.js checks
// the data (nothing may be missing) and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; scattering inside other outlines (cells, bags), the settings, the key's
// text layout, the descriptions in words and the tidying of stored settings are left out (Oomba checks the data and
// draws the box and its key its own way).

export const PT_RADIUS = { xs: 6, s: 10, m: 15, l: 20, xl: 26 };
export const PT_SHADES = { white: '#FFFFFF', light: '#DCDCDC', gray: '#A3A3A3', dark: '#5C5C5C', black: '#111111' };
/** Which way each outer disc points from the center, in degrees clockwise from the right (y down). */
export const PT_DIRECTIONS = { single: [], pair: [0], bent: [90 - 52.25, 90 + 52.25], line: [0, 180], triangle: [-90, 30, 150], cross: [0, 90, 180, 270] };
const ptRound = n => Math.round(n * 1000) / 1000;
/** A small seeded random number generator (mulberry32): the same seed always gives the same numbers, 0 up to 1. */
export function ptRandom(seed) {
  let a = Math.floor(seed) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** How far the outer discs sit from the center: touching with a slight overlap, or further out when big outer discs
 *  around a small center would pile onto each other. */
function ptOuterDistance(kind) {
  const rc = PT_RADIUS[kind.look.size], ro = PT_RADIUS[kind.outer.size], touching = rc + ro - 0.2 * Math.min(rc, ro), dirs = PT_DIRECTIONS[kind.shape];
  if (dirs.length < 2) return touching;
  const sorted = [...dirs].sort((a, b) => a - b), gaps = sorted.map((a, i) => (i ? a - sorted[i - 1] : a + 360 - sorted[sorted.length - 1]));
  return Math.max(touching, (0.9 * ro) / Math.sin((Math.min(...gaps) * Math.PI) / 180 / 2));
}
/** A particle's discs around (0, 0), turned by angle (radians): the outer discs first and the center last. */
export function ptDiscs(kind, angle = 0) {
  const center = { ...kind.look, x: 0, y: 0, r: PT_RADIUS[kind.look.size] };
  if (kind.shape === 'single') return [center];
  const dist = ptOuterDistance(kind);
  return [...PT_DIRECTIONS[kind.shape].map(deg => { const a = (deg * Math.PI) / 180 + angle; return { ...kind.outer, x: dist * Math.cos(a), y: dist * Math.sin(a), r: PT_RADIUS[kind.outer.size] }; }), center];
}
export function ptBounds(discs) {
  return { left: Math.min(...discs.map(d => d.x - d.r)), right: Math.max(...discs.map(d => d.x + d.r)), top: Math.min(...discs.map(d => d.y - d.r)), bottom: Math.max(...discs.map(d => d.y + d.r)) };
}
const ptReach = kind => ptRound(Math.max(...ptDiscs(kind).map(d => Math.hypot(d.x, d.y) + d.r)));
export const PT_SCATTER_GAP = 7;
const PT_TRIES = 400;
/** A gas: every particle placed at random and turned at random, at least the gap from every other and from the edge;
 *  bigger ones first. -> { discs, missing }. */
export function ptScatter(kinds, width, height, seed) {
  const random = ptRandom(seed), wanted = kinds.flatMap((kind, order) => { const r = ptReach(kind); return Array.from({ length: kind.count }, () => ({ kind, order, reach: r })); });
  wanted.sort((a, b) => b.reach - a.reach || a.order - b.order);
  const discs = [], full = new Set();
  let missing = 0;
  for (const { kind, order, reach: r } of wanted) {
    const margin = r + PT_SCATTER_GAP, room = !full.has(order) && width >= 2 * margin && height >= 2 * margin;
    let found;
    for (let i = 0; room && i < PT_TRIES && !found; i++) {
      const angle = random() * 2 * Math.PI, x = margin + random() * (width - 2 * margin), y = margin + random() * (height - 2 * margin);
      const cand = ptDiscs(kind, angle).map(d => ({ ...d, x: ptRound(d.x + x), y: ptRound(d.y + y) }));
      if (cand.every(c => discs.every(o => (c.x - o.x) ** 2 + (c.y - o.y) ** 2 >= (c.r + o.r + PT_SCATTER_GAP) ** 2))) found = cand;
    }
    if (found) discs.push(...found); else { missing++; full.add(order); }
  }
  return { discs, missing };
}
function ptShuffled(kinds, random) {
  const all = kinds.flatMap((kind, order) => Array.from({ length: kind.count }, () => ({ kind, order })));
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}
export const PT_LIQUID_GAP = 2;
const PT_DROPS = 16;
/** A liquid: each particle dropped in a random order and turned at random, resting on the floor or the first disc below
 *  it; of a few random places across the box, the lowest. -> { discs, missing }. */
export function ptPour(kinds, width, height, seed) {
  const random = ptRandom(seed), discs = [], full = new Set();
  let missing = 0;
  for (const { kind, order } of ptShuffled(kinds, random)) {
    let found, lowest = -Infinity;
    for (let i = 0; !full.has(order) && i < PT_DROPS; i++) {
      const shape = ptDiscs(kind, random() * 2 * Math.PI).map(d => ({ ...d, x: ptRound(d.x), y: ptRound(d.y) })), b = ptBounds(shape), across = width - 2 * PT_LIQUID_GAP - (b.right - b.left);
      if (across < 0) continue;
      const x = ptRound(PT_LIQUID_GAP - b.left + random() * across);
      let y = height - PT_LIQUID_GAP - b.bottom;
      for (const c of shape) for (const o of discs) { const touch = c.r + o.r + PT_LIQUID_GAP, dx = c.x + x - o.x; if (Math.abs(dx) < touch) y = Math.min(y, o.y - Math.sqrt(touch ** 2 - dx ** 2) - c.y); }
      y = Math.floor(y * 1000) / 1000;
      if (y + b.top >= PT_LIQUID_GAP && y > lowest) { lowest = y; found = shape.map(d => ({ ...d, x: ptRound(d.x + x), y: ptRound(d.y + y) })); }
    }
    if (found) discs.push(...found); else { missing++; full.add(order); }
  }
  return { discs, missing };
}
export const PT_SOLID_GAP = 2;
/** A solid: rows at the bottom, all turned the same way, each in a cell as big as the biggest particle, filled from the
 *  bottom up and centered across; which goes where is shuffled by the seed. -> { discs, missing }. */
export function ptStack(kinds, width, height, seed) {
  const all = ptShuffled(kinds, ptRandom(seed));
  if (!all.length) return { discs: [], missing: 0 };
  const drawn = kinds.filter(k => k.count).map(k => ptBounds(ptDiscs(k)));
  const cellW = Math.max(...drawn.map(b => b.right - b.left)) + PT_SOLID_GAP, cellH = Math.max(...drawn.map(b => b.bottom - b.top)) + PT_SOLID_GAP;
  const perRow = Math.max(0, Math.floor((width - PT_SOLID_GAP) / cellW)), room = perRow * Math.max(0, Math.floor((height - PT_SOLID_GAP) / cellH)), placed = all.slice(0, room), discs = [];
  placed.forEach(({ kind }, i) => {
    const row = Math.floor(i / perRow), inRow = Math.min(perRow, placed.length - row * perRow), left = (width - inRow * cellW) / 2, own = ptDiscs(kind), b = ptBounds(own);
    const cx = left + ((i % perRow) + 0.5) * cellW, cy = height - PT_SOLID_GAP / 2 - (row + 0.5) * cellH;
    discs.push(...own.map(d => ({ ...d, x: ptRound(d.x + cx - (b.left + b.right) / 2), y: ptRound(d.y + cy - (b.top + b.bottom) / 2) })));
  });
  return { discs, missing: all.length - placed.length };
}
/** The particles in a box for its state. */
export const ptArrange = (state, kinds, w, h, seed) => (state === 'liquid' ? ptPour : state === 'solid' ? ptStack : ptScatter)(kinds, w, h, seed);

/** How many second atoms a lattice has room for: any site when swapping, any gap between four when filling gaps. */
export function ptLatticeRoom(o) {
  if (o.pattern === 'substitute') return o.rows * o.columns;
  if (o.pattern === 'interstitial') return Math.max(0, o.rows - 1) * Math.max(0, o.columns - 1);
  return 0;
}
function ptPick(total, n, random) {
  const order = Array.from({ length: total }, (_, i) => i);
  for (let i = total - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return new Set(order.slice(0, n));
}
function ptPitch(o) {
  const rm = PT_RADIUS[o.main.size], rs = PT_RADIUS[o.second.size], gap = o.spacing === 'spaced' ? 0.7 * Math.max(rm, rs) : 0;
  if (o.pattern === 'pure') return 2 * rm + gap;
  if (o.pattern === 'alternate') return Math.max(rm + rs, Math.SQRT2 * Math.max(rm, rs)) + gap;
  if (o.pattern === 'substitute') return 2 * Math.max(rm, rs) + gap;
  return Math.max(2 * rm, Math.SQRT2 * (rm + rs)) + gap;
}
/** A lattice's discs with its top left corner at (0, 0), its size, and how many second atoms had no room. */
export function ptLattice(o) {
  const step = ptPitch(o), random = ptRandom(o.seed), edge = o.pattern === 'pure' || o.pattern === 'interstitial' ? PT_RADIUS[o.main.size] : Math.max(PT_RADIUS[o.main.size], PT_RADIUS[o.second.size]);
  const disc = (look, col, row) => ({ ...look, r: PT_RADIUS[look.size], x: edge + col * step, y: edge + row * step });
  const swapped = o.pattern === 'substitute' ? ptPick(o.rows * o.columns, o.secondCount, random) : new Set(), discs = [];
  for (let row = 0; row < o.rows; row++) for (let col = 0; col < o.columns; col++) discs.push(disc(o.pattern === 'alternate' ? ((row + col) % 2 === 1 ? o.second : o.main) : swapped.has(row * o.columns + col) ? o.second : o.main, col, row));
  if (o.pattern === 'interstitial') {
    const across = o.columns - 1, gaps = ptPick(ptLatticeRoom(o), o.secondCount, random);
    for (const g of [...gaps].sort((a, b) => a - b)) discs.push(disc(o.second, (g % across) + 0.5, Math.floor(g / across) + 0.5));
  }
  const size = n => 2 * edge + (n - 1) * step, room = o.pattern === 'substitute' || o.pattern === 'interstitial' ? ptLatticeRoom(o) : Infinity;
  return { discs, width: size(o.columns), height: size(o.rows), missing: Math.max(0, o.secondCount - room) };
}
