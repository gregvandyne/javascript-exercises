// Oomba Figures: particle diagrams (1.2.0, the chemistry pack). Atoms, ions and molecules as discs in a box, arranged for
// their state (a gas scattered, a liquid settled close and jumbled, a solid in rows), or a lattice; with a key, and a
// second box for after a reaction or a change of state. Where the particles go comes from ported/particles.js (seeded,
// so the same data always draws the same figure, on the server too). Truthful: every particle asked for is drawn (data
// that does not fit is refused, never drawn short), and a before and after keeps every atom (atoms are conserved). The
// checks, the answers and the drawing are Oomba's own; the discs are grays, so they print as they show.
import { node, label, arrow, frame, palette, text, r2 } from './svg.js';
import { figWords } from './words.js';
import { PT_RADIUS, PT_SHADES, PT_DIRECTIONS, ptDiscs, ptBounds, ptArrange, ptLattice, ptLatticeRoom } from './ported/particles.js';

const PA_KEYS = ['kind', 'hide', 'particles', 'state', 'seed', 'boxes', 'afterState', 'arrow', 'lattice', 'border', 'heading'];
const PA_CHARGES = ['', '+', '-', '2+', '2-', '3+', '3-'];
const PA_SHAPES = Object.keys(PT_DIRECTIONS);
const BOX = 300;
const lookOk = l => l && typeof l === 'object' && Object.prototype.hasOwnProperty.call(PT_RADIUS, l.size) && Object.prototype.hasOwnProperty.call(PT_SHADES, l.shade) && (l.charge === undefined || PA_CHARGES.includes(l.charge));
const lookKey = l => `${l.size}/${l.shade}/${l.charge || ''}`;
const kindOf = k => ({ count: k.count, shape: k.shape || 'single', look: k.look, outer: k.outer || { size: 's', shade: 'white' } });
/** Every atom in the box, by its look: { 'm/gray/': 4, ... }. */
function paAtoms(kinds, field) {
  const out = {};
  for (const k of kinds) {
    const n = field === 'after' ? k.after ?? k.count : k.count, outer = PT_DIRECTIONS[k.shape || 'single'].length;
    if (!n) continue;
    out[lookKey(k.look)] = (out[lookKey(k.look)] || 0) + n;
    if (outer) out[lookKey(k.outer)] = (out[lookKey(k.outer)] || 0) + n * outer;
  }
  return out;
}
const paBox = (d, field) => ptArrange(field === 'after' ? d.afterState || d.state || 'gas' : d.state || 'gas', d.particles.map(k => ({ ...kindOf(k), count: field === 'after' ? k.after ?? k.count : k.count })), BOX, BOX, d.seed ?? 2);
const paLattice = d => { const L = d.lattice; return ptLattice({ pattern: L.pattern || 'pure', rows: L.rows, columns: L.columns, spacing: L.spacing || 'touching', main: L.main, second: L.second || L.main, secondCount: L.secondCount || 0, seed: d.seed ?? 2 }); };
/**
 * { particles: [{ count, shape?: "single" | "pair" | "bent" | "line" | "triangle" | "cross", look: { size: "xs" | "s" | "m"
 * | "l" | "xl", shade: "white" | "light" | "gray" | "dark" | "black", charge?: "+" | "-" | "2+" ... }, outer?: (the
 * outer discs' look), name?: (for the key), after?: (how many in the after box) }] (1 to 4 kinds, up to 60 each), state?:
 * "gas" | "liquid" | "solid", seed?: 2 (another seed, another arrangement), boxes?: 2 (before and after: atoms are
 * conserved), afterState?, arrow?: (words over the arrow) } or { lattice: { pattern: "pure" | "alternate" |
 * "substitute" | "interstitial", rows, columns, main: look, second?: look, secondCount?, spacing?: "touching" |
 * "spaced", mainName?, secondName? } }. hide: "names" or true (the key's names blank, to write).
 */
export const particles = {
  check(d) {
    const odd = Object.keys(d).filter(k => !PA_KEYS.includes(k));
    if (odd.length) return [`a particle diagram does not take "${odd[0]}"`];
    const out = [];
    if (d.seed !== undefined && !(Number.isInteger(d.seed) && d.seed >= 1 && d.seed <= 999999)) out.push('"seed" must be a whole number from 1 to 999999');
    if (d.border !== undefined && typeof d.border !== 'boolean') out.push('"border" must be true or false');
    if (d.lattice !== undefined) {
      if (d.particles !== undefined) return ['give "particles" or a "lattice", not both'];
      const L = d.lattice;
      if (!L || typeof L !== 'object') return ['"lattice" is { pattern, rows, columns, main, second, secondCount }'];
      if (L.pattern !== undefined && !['pure', 'alternate', 'substitute', 'interstitial'].includes(L.pattern)) out.push('"pattern" must be "pure", "alternate", "substitute" or "interstitial"');
      for (const k of ['rows', 'columns']) if (!(Number.isInteger(L[k]) && L[k] >= 1 && L[k] <= 12)) out.push(`"${k}" must be 1 to 12`);
      if (!lookOk(L.main) || (L.second !== undefined && !lookOk(L.second))) out.push('"main" and "second" are looks: { size, shade, charge }');
      if (L.spacing !== undefined && !['touching', 'spaced'].includes(L.spacing)) out.push('"spacing" must be "touching" or "spaced"');
      if (out.length) return out;
      const p = L.pattern || 'pure', room = ptLatticeRoom({ pattern: p, rows: L.rows, columns: L.columns });
      if (p !== 'pure' && L.second === undefined) out.push(`a ${p} lattice needs a "second" look`);
      if (L.secondCount !== undefined && (!Number.isInteger(L.secondCount) || L.secondCount < 0 || (p !== 'substitute' && p !== 'interstitial' && L.secondCount))) out.push('"secondCount" is for a substitute or interstitial lattice (0 or more)');
      else if ((L.secondCount || 0) > room && (p === 'substitute' || p === 'interstitial')) out.push(`only ${room} second atoms fit in this lattice (${p === 'interstitial' ? 'one in each gap between four' : 'one per site'})`);
      return out;
    }
    const K = d.particles;
    if (!Array.isArray(K) || !K.length || K.length > 4) return ['"particles" lists 1 to 4 kinds: { count, shape, look, outer, name }'];
    K.forEach((k, i) => {
      const at = `kind ${i + 1}`;
      if (!k || !(Number.isInteger(k.count) && k.count >= 0 && k.count <= 60)) out.push(`${at}: "count" must be 0 to 60`);
      if (k && k.after !== undefined && !(Number.isInteger(k.after) && k.after >= 0 && k.after <= 60)) out.push(`${at}: "after" must be 0 to 60`);
      if (k && k.shape !== undefined && !PA_SHAPES.includes(k.shape)) out.push(`${at}: "shape" must be one of ${PA_SHAPES.join(', ')}`);
      if (!k || !lookOk(k.look) || (k.outer !== undefined && !lookOk(k.outer))) out.push(`${at}: "look" (and "outer") is { size: xs to xl, shade: white, light, gray, dark or black, charge }`);
      if (k && k.name !== undefined && !text(k.name, 30)) out.push(`${at}: "name" must be a short name`);
    });
    for (const k of ['state', 'afterState']) if (d[k] !== undefined && !['gas', 'liquid', 'solid'].includes(d[k])) out.push(`"${k}" must be "gas", "liquid" or "solid"`);
    if (d.boxes !== undefined && ![1, 2].includes(d.boxes)) out.push('"boxes" must be 1 or 2');
    if (d.boxes !== 2 && (d.afterState !== undefined || d.arrow !== undefined || K.some(k => k && k.after !== undefined))) out.push('"after", "afterState" and "arrow" are for two boxes ("boxes": 2)');
    if (out.length) return out;
    if (!K.some(k => k.count)) out.push('there must be at least one particle');
    for (const field of d.boxes === 2 ? ['count', 'after'] : ['count']) {
      const want = K.reduce((s, k) => s + (field === 'after' ? k.after ?? k.count : k.count), 0), r = paBox(d, field);
      if (r.missing) out.push(`${field === 'after' ? 'the after box' : 'the box'}: only ${want - r.missing} of the ${want} particles fit: use fewer, smaller ones, another state or another "seed"`);
    }
    if (d.boxes === 2) {
      const a = paAtoms(K, 'count'), b = paAtoms(K, 'after'), keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      const bad = keys.find(k => (a[k] || 0) !== (b[k] || 0));
      if (bad) out.push(`atoms are conserved: the ${bad.replace(/\//g, ' ').trim()} atoms are ${a[bad] || 0} before and ${b[bad] || 0} after (change the counts)`);
    }
    return out;
  },
  /** How many of each kind (before and after), the particles and atoms in all, and the lattice's sites. */
  solve(d) {
    if (particles.check(d).length) return null;
    if (d.lattice) { const r = paLattice(d), second = r.discs.filter(x => x.size === (d.lattice.second || {}).size && x.shade === (d.lattice.second || {}).shade && (x.charge || '') === ((d.lattice.second || {}).charge || '')).length; return { lattice: true, sites: r.discs.length, second: d.lattice.second ? second : 0, main: r.discs.length - (d.lattice.second ? second : 0) }; }
    const K = d.particles, kinds = K.map(k => ({ name: k.name || null, count: k.count, ...(d.boxes === 2 ? { after: k.after ?? k.count } : {}), atoms: 1 + PT_DIRECTIONS[k.shape || 'single'].length }));
    const total = K.reduce((s, k) => s + k.count, 0), atoms = Object.values(paAtoms(K, 'count')).reduce((s, n) => s + n, 0);
    return { kinds, total, atoms, ...(d.boxes === 2 ? { afterTotal: K.reduce((s, k) => s + (k.after ?? k.count), 0) } : {}) };
  },
  draw(d, o) {
    const P = palette(o), W = figWords(o.lang), kids = [], top = d.heading ? 34 : 16, x0 = 16, blank = o.hide === true || o.hide === 'names';
    const disc = (c, dx, dy) => [node('circle', { cx: r2(c.x + dx), cy: r2(c.y + dy), r: c.r, fill: PT_SHADES[c.shade], stroke: '#000000', 'stroke-width': 1.4, class: 'of-disc' }),
      c.charge ? label(r2(c.x + dx), r2(c.y + dy + 1), c.charge.replace('-', '−'), { anchor: 'middle', size: Math.max(9, Math.round(c.r * 0.9)), weight: 800, colour: c.shade === 'dark' || c.shade === 'black' ? '#FFFFFF' : '#000000' }) : null];
    if (d.heading) kids.push(label(x0, 16, text(d.heading, 60), { size: 14, colour: P.ink }));
    const boxAt = (x, discs) => [node('rect', { x, y: top, width: BOX, height: BOX, fill: '#FFFFFF', stroke: P.ink, 'stroke-width': 2.2 }), ...discs.flatMap(c => disc(c, x, top))];
    let right, key = [];
    if (d.lattice) {
      const r = paLattice(d), L = d.lattice, m = 10, wd = r.width + 2 * m, ht = r.height + 2 * m;
      if (d.border) kids.push(node('rect', { x: x0, y: top, width: r2(wd), height: r2(ht), fill: '#FFFFFF', stroke: P.ink, 'stroke-width': 2.2 }));
      kids.push(...r.discs.flatMap(c => disc(c, x0 + m, top + m)));
      right = x0 + wd + 24;
      key = [[{ count: 1, shape: 'single', look: L.main }, L.mainName], ...(L.second ? [[{ count: 1, shape: 'single', look: L.second }, L.secondName]] : [])].filter(([, n]) => n);
      return paFrame(kids, key, right, Math.max(top + ht, top + 40 + key.length * 56), P, W, o, blank, disc, top);
    }
    kids.push(...boxAt(x0, paBox(d, 'count').discs));
    right = x0 + BOX + 24;
    if (d.boxes === 2) {
      const ax = x0 + BOX + 14, bx = ax + 72;
      kids.push(arrow(ax, top + BOX / 2, ax + 58, top + BOX / 2, { colour: P.ink, width: 3, head: 13 }));
      if (d.arrow) kids.push(label(ax + 29, top + BOX / 2 - 18, text(d.arrow, 24), { anchor: 'middle', size: 13, colour: P.ink }));
      kids.push(...boxAt(bx, paBox(d, 'after').discs));
      right = bx + BOX + 24;
    }
    key = d.particles.filter(k => k.name).map(k => [kindOf(k), k.name]);
    return paFrame(kids, key, right, top + BOX, P, W, o, blank, disc, top);
  },
};
/** The figure, with its key (each named kind drawn as in the box, then its name) to the right. */
function paFrame(kids, key, right, bottom, P, W, o, blank, disc, top) {
  let y = top + 34, w = right;
  if (key.length) {
    const rows = key.map(([k, name]) => { const ds = ptDiscs(k), b = ptBounds(ds); return { ds, b, name }; });
    const kw = Math.max(...rows.map(r => r.b.right - r.b.left)) + 150, kh = 40 + rows.reduce((s, r) => s + Math.max(30, r.b.bottom - r.b.top) + 14, 0);
    kids.push(node('rect', { x: right, y: top, width: r2(kw), height: r2(kh), rx: 6, fill: '#FFFFFF', stroke: P.ink, 'stroke-width': 1.6, class: 'of-key' }), label(right + 12, top + 18, W('key'), { size: 15, weight: 800, colour: P.ink }));
    for (const r of rows) {
      const h = Math.max(30, r.b.bottom - r.b.top), cy = y + h / 2;
      kids.push(...r.ds.flatMap(c => disc(c, right + 14 - r.b.left, cy - (r.b.top + r.b.bottom) / 2)), label(right + 24 + (r.b.right - r.b.left), cy, blank ? '__________' : text(r.name, 30), { size: 14, colour: P.ink, cls: 'of-name' }));
      y += h + 14;
    }
    w = right + kw + 16; bottom = Math.max(bottom, top + kh);
  }
  return frame(r2(w), r2(bottom + 16), kids, { ...o, kind: 'particles' }, o.title || W('particles'));
}

export const PARTICLE_KINDS = { particles };
