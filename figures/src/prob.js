// Oomba Figures: probability and tables. A tree diagram (stages of branches with their probabilities, the outcomes and
// their products), a Venn diagram of 2 or 3 sets (counts or the elements themselves, regions shaded), a two-way table
// (with its totals, as counts or relative frequencies) and a table of values (from a rule in x, or pairs that must
// follow it). Everything written on them is worked out from their data: branches from one point add up to 1, a product
// is the product along its path, a Venn diagram's totals add up, a table's totals are sums and its values the rule's.
// Oomba's own code.
import { node, label, line, frame, palette, seriesColour, fmt, isNum, text, hides, r2 } from './svg.js';
import { figWords } from './words.js';
import { mathBox, mathNode, mathProblem, mathValue, mathText } from './mathtext.js';
import { niceText } from './ported/numbering.js';
import { figExpr, figExprProblem, anglesProblem } from './radians.js';
import { ddOdd, ddTexts, ddClaim, ddClean, ddTextW, ddPaints, ddV } from './data.js';

const pbGcd = (a, b) => (b ? pbGcd(b, a % b) : Math.abs(a));
/** A probability: a decimal 0 to 1, or a fraction [n, d] (kept exact). -> { v, n, d } (n, d null for a decimal), or null. */
function pbProb(p) {
  if (isNum(p, 0, 1)) return { v: p, n: null, d: null };
  if (Array.isArray(p) && p.length === 2 && Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[1] > 0 && p[0] >= 0 && p[0] <= p[1]) return { v: p[0] / p[1], n: p[0], d: p[1] };
  return null;
}
const pbReduce = (n, d) => { const g = pbGcd(n, d) || 1; return [n / g, d / g]; };
/** A probability as a math label: a stacked fraction (as given) or a decimal. */
const pbLabel = (q, lang) => (q.n !== null ? { frac: [q.n, q.d] } : fmt(q.v, 4, lang));

// ---------------------------------------------------------------- tree diagram
const TREE_KEYS = ['branches', 'repeat', 'stages', 'outcomes', 'products'];
function treeRead(d) {
  const out = [], odd = ddOdd(d, TREE_KEYS, 'treeDiagram'); if (odd) return { problems: [odd] };
  ddTexts(d, out, ['heading']);
  if (d.repeat !== undefined && !(Number.isInteger(d.repeat) && d.repeat >= 1 && d.repeat <= 4)) out.push('"repeat" (the same branches at every stage) must be 1 to 4');
  for (const k of ['outcomes', 'products']) if (d[k] !== undefined && typeof d[k] !== 'boolean') out.push(`"${k}" must be true or false`);
  if (out.length) return { problems: out };
  let leaves = 0, depth = 0;
  const read = (list, path, level) => {
    const at = path.length ? `the branches after ${path.join(', ')}` : 'the first branches';
    if (!Array.isArray(list) || list.length < 2 || list.length > 4) { out.push(`${at} must list 2 to 4 branches, like [{ "name": "H", "p": [1, 2] }]`); return null; }
    const kids = list.map((b, i) => {
      if (!b || typeof b !== 'object' || Object.keys(b).some(k => !['name', 'p', 'then', 'label'].includes(k))) { out.push(`${at}: branch ${i + 1} must be { "name", "p", "then", "label" }`); return null; }
      if (!text(b.name, 12)) { out.push(`${at}: branch ${i + 1} needs a short "name" (the outcome, like "H" or "Red")`); return null; }
      const q = pbProb(b.p);
      if (!q) { out.push(`${at}: "${b.name}" needs "p", a probability from 0 to 1 (a decimal, or a fraction [n, d])`); return null; }
      const pathHere = [...path, text(b.name, 12)];
      if (b.label !== undefined && b.label !== false) { const why = ddClaim(b.label, q.v, `the branch ${pathHere.join(', ')}`); if (why) { out.push(why); return null; } }
      let then = null;
      if (d.repeat !== undefined && b.then !== undefined) { out.push('with "repeat", every stage has the same branches: leave out "then"'); return null; }
      if (b.then !== undefined) then = read(b.then, pathHere, level + 1);
      else if (d.repeat !== undefined && level + 1 < d.repeat) then = read(d.branches, pathHere, level + 1);
      if ((b.then !== undefined || (d.repeat !== undefined && level + 1 < d.repeat)) && !then) return null;
      if (!then) { leaves++; depth = Math.max(depth, level + 1); }
      return { name: text(b.name, 12), q, label: b.label, then, path: pathHere };
    });
    if (kids.some(k => !k)) return null;
    // the branches from one point add up to 1: exactly, when they are fractions
    const fr = kids.every(k => k.q.n !== null);
    const one = fr ? (() => { const den = kids.reduce((t, k) => (t * k.q.d) / pbGcd(t, k.q.d), 1); return kids.reduce((t, k) => t + (k.q.n * den) / k.q.d, 0) === den; })() : Math.abs(kids.reduce((t, k) => t + k.q.v, 0) - 1) < 1e-9;
    if (!one) { out.push(`${at} add up to ${fmt(kids.reduce((t, k) => t + k.q.v, 0), 4)}, not 1: the probabilities on branches from one point must add up to 1`); return null; }
    return kids;
  };
  const root = read(d.branches, [], 0);
  if (!root || out.length) return { problems: out.length ? out : ['the tree could not be read'] };
  if (depth > 4 || leaves > 16) return { problems: ['a tree diagram has at most 4 stages and 16 outcomes'] };
  if (d.stages !== undefined && (!Array.isArray(d.stages) || d.stages.length !== depth || d.stages.some(s => typeof s !== 'string' || s.length > 24))) return { problems: [`"stages" must list ${depth} short headings, one for each stage (like "1st draw")`] };
  // the outcomes: each path to the end, its probability the product along it
  const outcomes = [];
  const walk = (list, q) => { for (const b of list) { const p = { v: q.v * b.q.v, n: q.n !== null && b.q.n !== null ? q.n * b.q.n : null, d: q.n !== null && b.q.n !== null ? q.d * b.q.d : null }; if (b.then) walk(b.then, p); else outcomes.push({ path: b.path, ...p }); } };
  walk(root, { v: 1, n: 1, d: 1 });
  return { problems: [], root, depth, leaves, outcomes };
}
export const treeDiagram = {
  check(d) { return treeRead(d).problems; },
  /** Each outcome (its path) with its probability (and as a fraction [n, d] in lowest terms when the branches are
   *  fractions); each branch's probability, which is the probability of its outcome given the path before it; and for
   *  each stage, the probability of each outcome at that stage. */
  solve(d) {
    const r = treeRead(d); if (r.problems.length) return null;
    const branches = [], stages = Array.from({ length: r.depth }, () => ({}));
    const walk = (list, pv) => { for (const b of list) { branches.push({ path: b.path, p: b.q.v }); const k = b.path.length - 1; stages[k][b.name] = ddClean((stages[k][b.name] || 0) + pv * b.q.v); if (b.then) walk(b.then, pv * b.q.v); } };
    walk(r.root, 1);
    return { outcomes: r.outcomes.map(o => ({ path: o.path, p: ddClean(o.v), fraction: o.n !== null ? pbReduce(o.n, o.d) : null })), branches, stages };
  },
  draw(d, o) {
    const r = treeRead(d), P = palette(o), lang = o.lang, W = figWords(lang), FS = 18;
    const T = 18 + (d.heading ? 30 : 0) + (d.stages ? 34 : 6), gap = r.leaves > 8 ? 46 : 78, colW = 180, x0 = 26, kids = [];
    const showP = o.hide !== true && !hides(o, 'probabilities'), showOut = d.outcomes !== false, showProd = d.products !== false && d.outcomes !== false;
    let leaf = 0;
    const place = (list, px, py, level) => list.map(b => {
      const x = x0 + (level + 1) * colW;
      let y, kids2 = null;
      if (b.then) { kids2 = place(b.then, x, null, level + 1); y = (kids2[0].y + kids2[kids2.length - 1].y) / 2; }
      else { y = T + gap / 2 + leaf * gap; leaf++; }
      return { b, x, y, kids: kids2 };
    });
    const top = place(r.root, x0, null, 0), rootY = (top[0].y + top[top.length - 1].y) / 2;
    const leavesDrawn = [];
    const drawAll = (nodes, px, py) => {
      for (const n of nodes) {
        const sx = px + (px === x0 ? 0 : 20), ex = n.x - 16;
        kids.push(line(sx, py, ex, n.y, P.ink, 2.2, { class: 'of-branch' }));
        kids.push(label(n.x, n.y, n.b.name, { size: 20, weight: 600, colour: o.print ? P.ink : P.blue, cls: 'of-outcome-name', anchor: 'start' }));
        const pathKey = n.b.path.join(',');
        if (showP && !hides(o, pathKey) && n.b.label !== false) {
          const bx = mathBox(n.b.label !== undefined ? n.b.label : pbLabel(n.b.q, lang), 21, { lang });
          const mx = (sx + ex) / 2, my = (py + n.y) / 2, up = n.y <= py;
          const by = up ? my - 8 - bx.desc : my + 8 + bx.asc;
          kids.push(mathNode(bx, mx - bx.w / 2 - (up ? 6 : -6) * 0, by, { color: P.ink, cls: 'of-prob', halo: P.paper }));
        }
        if (n.kids) drawAll(n.kids, n.x, n.y); else leavesDrawn.push(n);
      }
    };
    drawAll(top, x0, rootY);
    kids.push(node('circle', { cx: x0, cy: rootY, r: 3, fill: P.ink }));
    let right = x0 + r.depth * colW + 40;
    const xo = right + 20, xp = xo + Math.max(...r.outcomes.map(oc => ddTextW(oc.path.join(', '), 16))) + 36;
    if (showOut) leavesDrawn.forEach((n, i) => {
      const oc = r.outcomes[i];
      kids.push(label(xo, n.y, oc.path.join(', '), { size: 18, weight: 500, colour: P.ink, cls: 'of-outcome' }));
      if (showProd && o.hide !== true && !hides(o, 'products') && !hides(o, `${oc.path.join(',')}=`)) {
        const bx = mathBox(oc.n !== null ? { frac: pbReduce(oc.n, oc.d) } : fmt(oc.v, 4, lang), 21, { lang });
        kids.push(mathNode(bx, xp, n.y + (bx.asc - bx.desc) / 2, { color: P.ink, cls: 'of-product' }));
      }
    });
    right = showOut ? xp + (showProd ? 70 : 0) : right;
    if (d.stages) d.stages.forEach((s, k) => kids.push(label(x0 + k * colW + colW / 2 + 10, T - 22, s, { anchor: 'middle', size: 15, colour: P.ink, cls: 'of-stage' })));
    const Wd = right + 20, Hd = T + r.leaves * gap + 10;
    if (d.heading) kids.push(label(Wd / 2, 24, text(d.heading, 60), { anchor: 'middle', size: 16, colour: P.ink, cls: 'of-heading' }));
    return frame(Wd, Hd, kids, { ...o, kind: 'treeDiagram' }, o.title || text(d.heading, 60) || W('treeDiagram'));
  },
};

// ---------------------------------------------------------------- Venn diagram
const VENN_KEYS = ['sets', 'counts', 'members', 'universe', 'totals', 'labels', 'shade', 'show'];
const VENN_REGIONS = { 2: ['A', 'B', 'AB', 'none'], 3: ['A', 'B', 'C', 'AB', 'AC', 'BC', 'ABC', 'none'] };
const vennIn = (key, s) => key !== 'none' && key.includes(s);
function vennRead(d) {
  const out = [], odd = ddOdd(d, VENN_KEYS, 'vennDiagram'); if (odd) return { problems: [odd] };
  ddTexts(d, out, ['heading']);
  if (!Array.isArray(d.sets) || d.sets.length < 2 || d.sets.length > 3 || d.sets.some(s => !text(s, 16))) return { problems: [...out, '"sets" must name 2 or 3 sets, like ["Cat", "Dog"] (they are A, B and C, in that order)'] };
  const names = d.sets.map(s => text(s, 16)), k = names.length, letters = 'ABC'.slice(0, k).split(''), keys = VENN_REGIONS[k];
  const letterOf = s => (letters.includes(s) ? s : letters[names.indexOf(s)] || null);
  if ((d.counts === undefined) === (d.members === undefined)) return { problems: [...out, 'give "counts" (how many in each region: { "A", "B", "AB", "none" ... }) or "members" (each set\'s elements), not both'] };
  let counts = {}, elements = null;
  if (d.counts !== undefined) {
    if (!d.counts || typeof d.counts !== 'object' || Array.isArray(d.counts)) return { problems: [...out, '"counts" must be { region: how many }'] };
    const bad = Object.keys(d.counts).find(x => !keys.includes(x)); if (bad) return { problems: [...out, `"${bad}" is not a region: the regions are ${keys.join(', ')} (A only, A and B only, ..., none: in no set)`] };
    const miss = keys.find(x => !ddCountOk(d.counts[x])); if (miss) return { problems: [...out, `"counts" needs a whole number 0 or more for every region (${miss} is missing): hide one with "labels" or hide`] };
    counts = { ...d.counts };
  } else {
    const items = x => Array.isArray(x) && x.length <= 30 && x.every(e => isNum(e, -1e6, 1e6) || text(e, 12));
    if (!Array.isArray(d.members) || d.members.length !== k || !d.members.every(items)) return { problems: [...out, `"members" must list ${k} lists, each set's elements (numbers or short words)`] };
    const uni = d.universe === undefined ? [...new Set(d.members.flat())] : d.universe;
    if (!items(uni) || uni.length > 40) return { problems: [...out, '"universe" must list every element (40 at most), numbers or short words'] };
    const missing = d.members.flat().find(e => !uni.includes(e)); if (missing !== undefined) return { problems: [...out, `${missing} is in a set but not in the universe`] };
    if (new Set(uni).size !== uni.length || d.members.some(m => new Set(m).size !== m.length)) return { problems: [...out, 'an element is listed twice'] };
    elements = Object.fromEntries(keys.map(x => [x, []]));
    for (const e of uni) { const key = letters.filter((_, i) => d.members[i].includes(e)).join('') || 'none'; elements[key].push(e); }
    counts = Object.fromEntries(keys.map(x => [x, elements[x].length]));
  }
  const setTotal = s => keys.filter(x => vennIn(x, s)).reduce((t, x) => t + counts[x], 0), all = keys.reduce((t, x) => t + counts[x], 0);
  if (d.totals !== undefined) {
    if (!d.totals || typeof d.totals !== 'object' || Array.isArray(d.totals)) out.push('"totals" must be { set (letter or name): its total, "all": the total }');
    else for (const [t, v] of Object.entries(d.totals)) {
      const want = t === 'all' ? all : letterOf(t) ? setTotal(letterOf(t)) : null;
      if (want === null) out.push(`totals: "${t}" is not a set`); else if (v !== want) out.push(`${t === 'all' ? 'the total' : `the total of ${names[letters.indexOf(letterOf(t))]}`} is given as ${v} but the regions add up to ${want}: the counts must add up`);
    }
  }
  if (d.labels !== undefined) {
    if (!d.labels || typeof d.labels !== 'object' || Array.isArray(d.labels)) out.push('"labels" must be { region: a label }, like { "AB": "x" }');
    else for (const [x, l] of Object.entries(d.labels)) { if (!keys.includes(x)) out.push(`labels: "${x}" is not a region`); else { const why = ddClaim(l, counts[x], `the region ${x}`); if (why) out.push(why); } }
  }
  if (d.show !== undefined && !['counts', 'elements'].includes(d.show)) out.push('"show" must be "counts" or "elements"');
  if (d.show === 'elements' && !elements) out.push('"show": "elements" needs "members"');
  let shade = [];
  if (d.shade !== undefined) {
    const list = Array.isArray(d.shade) ? d.shade : [d.shade];
    for (const s of list) {
      if (typeof s === 'string') { if (!keys.includes(s)) out.push(`shade: "${s}" is not a region (${keys.join(', ')}); for a whole set use { "in": ["A"] }`); else shade.push(s); }
      else if (s && typeof s === 'object' && Object.keys(s).every(x => ['in', 'out'].includes(x))) {
        const ins = (s.in || []).map(letterOf), outs = (s.out || []).map(letterOf);
        if (ins.includes(null) || outs.includes(null) || (!ins.length && !outs.length)) out.push('shade: { "in": [sets], "out": [sets] } takes set letters or names, like { "in": ["A"], "out": ["B"] } (A but not B)');
        else shade.push(...keys.filter(x => ins.every(a => vennIn(x, a)) && outs.every(b => !vennIn(x, b))));
      } else out.push('shade: each item is a region ("AB") or { "in": [...], "out": [...] }');
    }
    shade = [...new Set(shade)];
  }
  if (out.length) return { problems: out };
  return { problems: [], names, letters, keys, counts, elements, all, setTotal, shade };
}
const ddCountOk = v => Number.isInteger(v) && v >= 0 && v <= 1e6;
export const vennDiagram = {
  check(d) { return vennRead(d).problems; },
  /** How many in each region (and its elements), each set's total, each pair's intersection (all of it), the union,
   *  the total, the shaded regions and their count, and probabilities: P(set) and P(A|B) for each pair. */
  solve(d) {
    const r = vennRead(d); if (r.problems.length) return null;
    const sets = Object.fromEntries(r.letters.map(s => [s, r.setTotal(s)])), both = {}, given = {};
    for (const a of r.letters) for (const b of r.letters) if (a < b) both[a + b] = r.keys.filter(x => vennIn(x, a) && vennIn(x, b)).reduce((t, x) => t + r.counts[x], 0);
    for (const a of r.letters) for (const b of r.letters) if (a !== b) { const ab = both[[a, b].sort().join('')]; given[`${a}|${b}`] = sets[b] ? ddClean(ab / sets[b]) : null; }
    return { names: Object.fromEntries(r.letters.map((s, i) => [s, r.names[i]])), regions: r.counts, elements: r.elements, sets, both, union: r.all - r.counts.none, none: r.counts.none, total: r.all,
      shaded: r.shade, shadedCount: r.shade.reduce((t, x) => t + r.counts[x], 0), p: Object.fromEntries(r.letters.map(s => [s, r.all ? ddClean(sets[s] / r.all) : null])), given };
  },
  draw(d, o) {
    const r = vennRead(d), P = palette(o), lang = o.lang, W = figWords(lang), three = r.letters.length === 3;
    const T = 18 + (d.heading ? 30 : 0), bw = 460, bh = three ? 380 : 290, bx = 20, cx = bx + bw / 2, cy = T + bh / 2 + (three ? 6 : 8), R = three ? 100 : 108;
    const C = three ? [[cx - 56, cy - 44], [cx + 56, cy - 44], [cx, cy + 52]] : [[cx - 64, cy], [cx + 64, cy]];
    const inside = (x, y, i) => (x - C[i][0]) ** 2 + (y - C[i][1]) ** 2 < R * R;
    const keyAt = (x, y) => r.letters.filter((_, i) => inside(x, y, i)).join('') || 'none';
    let h = 2166136261; for (const ch of JSON.stringify(d)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const id = `of-venn-${h.toString(36)}`, kids = [], defs = [];
    kids.push(node('rect', { x: bx, y: T, width: bw, height: bh, fill: 'none', stroke: P.ink, 'stroke-width': 2.2, class: 'of-universe' }), label(bx + 12, T + 20, 'U', { size: 18, italic: true, weight: 600, colour: P.ink }));
    // shaded regions: inside the region's sets (clipped by each circle in turn) and outside the others (masked)
    const shadeFill = o.print ? '#C4C4C4' : P.green, op = o.print ? 1 : 0.32;
    r.shade.forEach(key => {
      const ins = r.letters.map((s, i) => (vennIn(key, s) ? i : -1)).filter(i => i >= 0), outs = r.letters.map((s, i) => (vennIn(key, s) ? -1 : i)).filter(i => i >= 0);
      const mid = `${id}-m-${key}`;
      defs.push(node('mask', { id: mid }, node('rect', { x: bx, y: T, width: bw, height: bh, fill: '#FFFFFF' }), outs.map(i => node('circle', { cx: C[i][0], cy: C[i][1], r: R, fill: '#000000' }))));
      let g = node('rect', { x: bx, y: T, width: bw, height: bh, fill: shadeFill, 'fill-opacity': op, mask: `url(#${mid})`, class: 'of-shade', 'data-region': key });
      for (const i of ins) { const cid = `${id}-c${i}`; if (!defs.some(x => x.attrs.id === cid)) defs.push(node('clipPath', { id: cid }, node('circle', { cx: C[i][0], cy: C[i][1], r: R }))); g = node('g', { 'clip-path': `url(#${cid})` }, g); }
      kids.push(g);
    });
    C.forEach(([x, y]) => kids.push(node('circle', { cx: x, cy: y, r: R, fill: 'none', stroke: P.ink, 'stroke-width': 2.4, class: 'of-set' })));
    // the set names outside their circles, away from the middle
    const mx = C.reduce((t, c) => t + c[0], 0) / C.length, my = C.reduce((t, c) => t + c[1], 0) / C.length;
    C.forEach(([x, y], i) => {
      let dx = x - mx, dy = y - my; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      if (!three) { dx = i ? 0.62 : -0.62; dy = -0.78; }
      const nx = x + dx * (R + 8), ny = y + dy * (R + 8);
      const anchor = dx < -0.2 ? 'end' : dx > 0.2 ? 'start' : 'middle', tw = ddTextW(r.names[i], 16) * 0.95;
      const lx = anchor === 'start' ? Math.min(nx, bx + bw - 8 - tw) : anchor === 'end' ? Math.max(nx, bx + 8 + tw) : Math.max(bx + 8 + tw / 2, Math.min(bx + bw - 8 - tw / 2, nx));
      kids.push(label(lx, Math.max(T + 18, Math.min(T + bh - 14, ny)), r.names[i], { anchor, size: 16, colour: o.print ? P.ink : seriesColour(o, i + 1), cls: 'of-set-name' }));
    });
    // where each region's number goes: the point in it farthest from every edge (found on a fine grid)
    const best = {};
    for (let y = T + 14; y <= T + bh - 14; y += 3) for (let x = bx + 14; x <= bx + bw - 14; x += 3) {
      const key = keyAt(x, y);
      let room = Math.min(...C.map(([px, py]) => Math.abs(Math.hypot(x - px, y - py) - R)));
      if (key === 'none') room = Math.min(room, x - bx, bx + bw - x, y - T, T + bh - y, Math.hypot(x - bx - 14, y - T - 20) - 10) - (y < cy ? 6 : 0);
      if (!best[key] || room > best[key].room + 1e-9) best[key] = { x, y, room };
    }
    const showEl = r.elements && d.show !== 'counts';
    let nonePer = 6;
    if (o.hide !== true && !hides(o, 'counts') && !hides(o, 'elements')) for (const key of r.keys) {
      if (hides(o, key) || !best[key]) continue;
      const l = d.labels && d.labels[key] !== undefined ? d.labels[key] : null;
      if (l === false) continue;
      let { x, y } = best[key];
      if (showEl && l === null && key === 'none' && r.elements.none.length) {
        // the elements outside every set go in a corner where their lines fit clear of the circles
        const n = r.elements.none.length;
        for (const per of [6, 4, 3, 2]) {
          const tw = Math.min(per, n) * 27, th = Math.ceil(n / per) * 19 + 6;
          const clear = (cx2, cy2) => [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].every(([sx2, sy2]) => keyAt(cx2 + (sx2 * tw) / 2, cy2 + (sy2 * th) / 2) === 'none');
          const spot = [[bx + bw - 10 - tw / 2, T + bh - 10 - th / 2], [bx + 10 + tw / 2, T + bh - 10 - th / 2], [bx + bw - 10 - tw / 2, T + 34 + th / 2]].find(([a, b]) => clear(a, b));
          if (spot) { [x, y] = spot; nonePer = per; break; }
        }
      }
      if (showEl && l === null) {
        const els = r.elements[key].map(e => (typeof e === 'number' ? fmt(e, 4, lang) : String(e))), per = key === 'none' ? nonePer : 4, rows = [];
        for (let i = 0; i < els.length; i += per) rows.push(els.slice(i, i + per).join('  '));
        rows.forEach((t, i) => kids.push(label(x, y + (i - (rows.length - 1) / 2) * 19, t, { anchor: 'middle', size: 15, weight: 500, colour: P.ink, cls: 'of-element' })));
      } else {
        const b = mathBox(l !== null ? l : r.counts[key], 18, { lang });
        kids.push(mathNode(b, x - b.w / 2, y + (b.asc - b.desc) / 2, { color: P.ink, cls: 'of-count' }));
      }
    }
    const Wd = bx * 2 + bw, Hd = T + bh + 16;
    if (d.heading) kids.push(label(Wd / 2, 24, text(d.heading, 60), { anchor: 'middle', size: 16, colour: P.ink, cls: 'of-heading' }));
    return frame(Wd, Hd, [defs.length ? node('defs', {}, defs) : null, kids], { ...o, kind: 'vennDiagram' }, o.title || text(d.heading, 60) || W('vennDiagram'));
  },
};

// ---------------------------------------------------------------- two-way table
const TWT_KEYS = ['columns', 'rows', 'counts', 'totals', 'show', 'form', 'dp', 'blanks', 'labels', 'corner'];
function twtRead(d) {
  const out = [], odd = ddOdd(d, TWT_KEYS, 'twoWayTable'); if (odd) return { problems: [odd] };
  ddTexts(d, out, ['heading', 'corner']);
  const names = (v, k) => (Array.isArray(v) && v.length >= 1 && v.length <= 6 && v.every(x => text(x, 20)) ? v.map(x => text(x, 20)) : (out.push(`"${k}" must list 1 to 6 short headings`), null));
  const cols = names(d.columns, 'columns'), rows = names(d.rows, 'rows');
  if (!cols || !rows) return { problems: out };
  if (!Array.isArray(d.counts) || d.counts.length !== rows.length || d.counts.some(rw => !Array.isArray(rw) || rw.length !== cols.length || !rw.every(ddCountOk))) return { problems: [...out, `"counts" must be ${rows.length} rows of ${cols.length} whole numbers 0 or more (one row for each of "rows")`] };
  if (d.totals !== undefined && typeof d.totals !== 'boolean') out.push('"totals" must be true or false');
  const show = d.show || 'counts';
  if (!['counts', 'joint', 'row', 'column'].includes(show)) out.push('"show" must be "counts", "joint" (each over the total), "row" (each over its row\'s total) or "column" (over its column\'s total)');
  const form = d.form || 'decimal';
  if (!['decimal', 'percent', 'fraction'].includes(form)) out.push('"form" must be "decimal", "percent" or "fraction"');
  if (d.dp !== undefined && !(Number.isInteger(d.dp) && d.dp >= 0 && d.dp <= 4)) out.push('"dp" must be 0 to 4');
  const counts = d.counts, rt = counts.map(rw => rw.reduce((t, v) => t + v, 0)), ct = cols.map((_, j) => counts.reduce((t, rw) => t + rw[j], 0)), all = rt.reduce((t, v) => t + v, 0);
  const totals = d.totals !== false;
  // every cell, totals included: [row][col] with the totals at index rows.length and cols.length
  const grid = [...counts.map((rw, i) => [...rw, rt[i]]), [...ct, all]];
  const den = (i, j) => (show === 'joint' ? all : show === 'row' ? grid[i][cols.length] : show === 'column' ? grid[rows.length][j] : 1);
  const value = (i, j) => (show === 'counts' ? grid[i][j] : den(i, j) ? grid[i][j] / den(i, j) : null);
  const inGrid = ([i, j]) => Number.isInteger(i) && Number.isInteger(j) && i >= 0 && j >= 0 && i <= rows.length - (totals ? 0 : 1) && j <= cols.length - (totals ? 0 : 1);
  if (d.blanks !== undefined && (!Array.isArray(d.blanks) || d.blanks.length > 30 || !d.blanks.every(b => Array.isArray(b) && b.length === 2 && inGrid(b)))) out.push('"blanks" must list cells [row, column] to leave empty (counting from 0; the totals are the last row and column)');
  if (d.labels !== undefined) {
    if (!d.labels || typeof d.labels !== 'object' || Array.isArray(d.labels)) out.push('"labels" must be { "row,column": a label }, like { "0,1": "x" }');
    else for (const [k, l] of Object.entries(d.labels)) {
      const m = /^(\d+),(\d+)$/.exec(k);
      if (!m || !inGrid([+m[1], +m[2]])) { out.push(`labels: "${k}" is not a cell ("row,column" from 0)`); continue; }
      const v = value(+m[1], +m[2]); const why = ddClaim(l, form === 'percent' && show !== 'counts' ? v * 100 : v, `the cell ${k}`); if (why) out.push(why);
    }
  }
  if (out.length) return { problems: out };
  return { problems: [], cols, rows, counts, rt, ct, all, grid, show, form, dp: d.dp === undefined ? (form === 'percent' ? 1 : 2) : d.dp, totals, value, den };
}
export const twoWayTable = {
  check(d) { return twtRead(d).problems; },
  /** The counts, row and column totals and the grand total; the joint relative frequencies (each over the total), and
   *  the conditional ones: each row's cells over its row total ("row") and each column's over its column total. */
  solve(d) {
    const r = twtRead(d); if (r.problems.length) return null;
    const rel = f => r.counts.map((rw, i) => rw.map((v, j) => { const q = f(i, j); return q ? ddClean(v / q) : null; }));
    return { columns: r.cols, rows: r.rows, counts: r.counts, rowTotals: r.rt, columnTotals: r.ct, total: r.all, joint: rel(() => r.all), row: rel(i => r.rt[i]), column: rel((i, j) => r.ct[j]) };
  },
  draw(d, o) {
    const r = twtRead(d), P = palette(o), lang = o.lang, W = figWords(lang), FS = 16;
    const nr = r.rows.length + (r.totals ? 1 : 0), nc = r.cols.length + (r.totals ? 1 : 0);
    const blank = new Set((d.blanks || []).map(b => `${b[0]},${b[1]}`));
    const cell = (i, j) => {
      if (o.hide === true || blank.has(`${i},${j}`) || hides(o, `${i},${j}`)) return null;
      if (d.labels && d.labels[`${i},${j}`] !== undefined) return d.labels[`${i},${j}`] === false ? null : d.labels[`${i},${j}`];
      const v = r.value(i, j);
      if (v === null) return '–';
      if (r.show === 'counts') return v;
      if (r.form === 'percent') return `${fmt(v * 100, r.dp, lang)}%`;
      if (r.form === 'fraction') { const n = r.grid[i][j], q = r.den(i, j), g = pbGcd(n, q) || 1; return n === 0 ? 0 : n === q ? 1 : { frac: [n / g, q / g] }; }
      return fmt(v, r.dp, lang);
    };
    const boxes = Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const l = cell(i, j); return l === null ? null : mathBox(l, FS, { lang }); }));
    const headW = Math.max(ddTextW(d.corner || '', 14), ...r.rows.map(x => ddTextW(x, 15)), r.totals ? ddTextW(W('total'), 15) : 0) + 24;
    const colW = Array.from({ length: nc }, (_, j) => Math.max(64, (j < r.cols.length ? ddTextW(r.cols[j], 15) : ddTextW(W('total'), 15)) + 22, ...boxes.map(rw => (rw[j] ? rw[j].w + 22 : 0))));
    const frac = r.form === 'fraction' && r.show !== 'counts', rowH = frac ? 50 : 36, T = 18 + (d.heading ? 30 : 0), L = 16;
    const xs = [L, L + headW]; colW.forEach(w => xs.push(xs[xs.length - 1] + w));
    const ys = Array.from({ length: nr + 2 }, (_, i) => T + i * rowH), kids = [];
    // shading for the header row and column, and the totals
    kids.push(node('rect', { x: L, y: T, width: xs[xs.length - 1] - L, height: rowH, fill: o.print ? '#E6E6E6' : P.soft }), node('rect', { x: L, y: T, width: headW, height: ys[ys.length - 1] - T, fill: o.print ? '#E6E6E6' : P.soft }));
    for (let i = 0; i < ys.length; i++) kids.push(line(L, ys[i], xs[xs.length - 1], ys[i], P.ink, i === 0 || i === ys.length - 1 || i === 1 ? 2 : 1.2, { 'stroke-linecap': 'square' }));
    for (let j = 0; j < xs.length; j++) kids.push(line(xs[j], T, xs[j], ys[ys.length - 1], P.ink, j === 0 || j === xs.length - 1 || j === 1 ? 2 : 1.2, { 'stroke-linecap': 'square' }));
    if (r.totals) kids.push(line(L, ys[nr], xs[xs.length - 1], ys[nr], P.ink, 2), line(xs[nc], T, xs[nc], ys[ys.length - 1], P.ink, 2));
    const mid = (a, b) => (a + b) / 2;
    if (d.corner) kids.push(label(L + 10, mid(ys[0], ys[1]), text(d.corner, 60), { size: 14, colour: P.ink2 }));
    for (let j = 0; j < nc; j++) kids.push(label(mid(xs[j + 1], xs[j + 2]), mid(ys[0], ys[1]), j < r.cols.length ? r.cols[j] : W('total'), { anchor: 'middle', size: 15, colour: P.ink, cls: 'of-head' }));
    for (let i = 0; i < nr; i++) kids.push(label(L + 12, mid(ys[i + 1], ys[i + 2]), i < r.rows.length ? r.rows[i] : W('total'), { size: 15, colour: P.ink, cls: 'of-head' }));
    for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
      const b = boxes[i][j]; if (!b) continue;
      kids.push(mathNode(b, mid(xs[j + 1], xs[j + 2]) - b.w / 2, mid(ys[i + 1], ys[i + 2]) + (b.asc - b.desc) / 2, { color: P.ink, cls: 'of-cell' }));
    }
    const Wd = xs[xs.length - 1] + 16, Hd = ys[ys.length - 1] + 16;
    if (d.heading) kids.push(label(Wd / 2, 24, text(d.heading, 60), { anchor: 'middle', size: 16, colour: P.ink, cls: 'of-heading' }));
    return frame(Wd, Hd, kids, { ...o, kind: 'twoWayTable' }, o.title || text(d.heading, 60) || W('twoWayTable'));
  },
};

// ---------------------------------------------------------------- table of values
const TOV_KEYS = ['rule', 'x', 'from', 'to', 'step', 'pairs', 'names', 'direction', 'blanks', 'dp', 'numbering', 'angles'];
function tovRead(d) {
  const out = [], odd = ddOdd(d, TOV_KEYS, 'tableOfValues'); if (odd) return { problems: [odd] };
  ddTexts(d, out, ['heading']);
  if (anglesProblem(d.angles)) out.push(anglesProblem(d.angles));
  if (d.rule !== undefined) { const why = typeof d.rule === 'string' ? figExprProblem(d.rule, d.angles) : '"rule" must be a formula in x, like "2*x + 1"'; if (why) return { problems: [...out, `"rule": ${why}`] }; }
  if (d.dp !== undefined && !(Number.isInteger(d.dp) && d.dp >= 0 && d.dp <= 4)) out.push('"dp" must be 0 to 4');
  if (d.numbering !== undefined && !['decimal', 'fraction'].includes(d.numbering)) out.push('"numbering" must be "decimal" or "fraction"');
  if (d.direction !== undefined && !['rows', 'columns'].includes(d.direction)) out.push('"direction" must be "rows" (x across the top) or "columns" (x down the left)');
  let xs = null, pairs = null;
  if (d.pairs !== undefined) {
    if (d.x !== undefined || d.from !== undefined) return { problems: [...out, 'give "pairs" or the x values ("x", or "from", "to", "step"), not both'] };
    if (!Array.isArray(d.pairs) || d.pairs.length < 1 || d.pairs.length > 12 || d.pairs.some(p => !Array.isArray(p) || p.length !== 2 || ddV(p[0]) === null || ddV(p[1]) === null)) return { problems: [...out, '"pairs" must list 1 to 12 pairs [x, y]'] };
    pairs = d.pairs.map(p => [ddV(p[0]), ddV(p[1])]);
    if (d.rule !== undefined) for (const [x, y] of pairs) {
      let v; try { v = figExpr(d.rule, { x }, d.angles); } catch (e) { out.push(`the rule has no value at x = ${fmt(x, 4)}`); break; }
      if (Math.abs(v - y) > 1e-9 * Math.max(1, Math.abs(v))) { out.push(`the pair (${fmt(x, 4)}, ${fmt(y, 4)}) does not follow the rule: at x = ${fmt(x, 4)} it gives ${fmt(v, 4)}`); break; }
    }
  } else {
    if (d.rule === undefined) return { problems: [...out, 'a table of values needs "rule" (a formula in x) with its x values, or "pairs"'] };
    if (d.x !== undefined) { if (!Array.isArray(d.x) || d.x.length < 1 || d.x.length > 12 || d.x.some(v => ddV(v) === null)) return { problems: [...out, '"x" must list 1 to 12 values'] }; xs = d.x.map(ddV); }
    else {
      const f = d.from === undefined ? -2 : ddV(d.from), t = d.to === undefined ? 2 : ddV(d.to), s = d.step === undefined ? 1 : ddV(d.step);
      if (f === null || t === null || !(s > 0) || t < f || (t - f) / s > 11 + 1e-9 || Math.abs((t - f) / s - Math.round((t - f) / s)) > 1e-6) return { problems: [...out, '"from", "to" and "step" must give 1 to 12 values of x (to a whole number of steps)'] };
      xs = Array.from({ length: Math.round((t - f) / s) + 1 }, (_, k) => ddClean(f + k * s));
    }
    pairs = [];
    for (const x of xs) { let v; try { v = figExpr(d.rule, { x }, d.angles); } catch (e) { out.push(`the rule has no value at x = ${fmt(x, 4)} (${e.message})`); break; } pairs.push([x, ddClean(v)]); }
  }
  if (d.names !== undefined && (!Array.isArray(d.names) || d.names.length !== 2 || d.names.some(n => !text(n, 24)))) out.push('"names" must be two short headings, like ["x", "y"] or ["Figure number", "Tiles"]');
  if (d.blanks !== undefined && (!Array.isArray(d.blanks) || d.blanks.some(i => !Number.isInteger(i) || i < 0 || i >= (pairs || []).length))) out.push(`"blanks" must list which y values to leave empty, counting from 0 (0 to ${(pairs || []).length - 1})`);
  if (out.length) return { problems: out };
  const fr = Array.isArray(d.step) || [...(d.x || []), ...(d.pairs || []).flat()].some(Array.isArray);
  return { problems: [], pairs, numbering: d.numbering || (fr ? 'fraction' : 'decimal'), dp: d.dp === undefined ? 2 : d.dp, names: d.names ? d.names.map(n => text(n, 24)) : ['x', 'y'] };
}
export const tableOfValues = {
  check(d) { return tovRead(d).problems; },
  /** The pairs [x, y], the differences between neighboring y values (and the second differences), and whether the
   *  table is linear (then its slope and intercept, from equally spaced x values). */
  solve(d) {
    const r = tovRead(d); if (r.problems.length) return null;
    const ys = r.pairs.map(p => p[1]), xs = r.pairs.map(p => p[0]), diffs = ys.slice(1).map((y, i) => ddClean(y - ys[i])), second = diffs.slice(1).map((v, i) => ddClean(v - diffs[i]));
    const slopes = ys.slice(1).map((y, i) => (xs[i + 1] !== xs[i] ? (y - ys[i]) / (xs[i + 1] - xs[i]) : NaN)), linear = slopes.length > 0 && slopes.every(s => Number.isFinite(s) && Math.abs(s - slopes[0]) < 1e-9);
    return { pairs: r.pairs, differences: diffs, second, linear, ...(linear ? { slope: ddClean(slopes[0]), intercept: ddClean(ys[0] - slopes[0] * xs[0]) } : {}) };
  },
  draw(d, o) {
    const r = tovRead(d), P = palette(o), lang = o.lang, W = figWords(lang), FS = 17, across = d.direction !== 'columns';
    const blanks = new Set(d.blanks || []), hideY = o.hide === true || hides(o, 'y');
    const val = v => (r.numbering === 'fraction' ? (() => { const t = niceText(v, 'fraction', lang); const m = /^(−?)(\d+)\/(\d+)$/.exec(t); return m ? [m[1] ? '-' : '', { frac: [Number(m[2]), Number(m[3])] }].filter(Boolean) : t; })() : fmt(v, r.dp, lang));
    const name = n => (/^[A-Za-z]$/.test(n) ? n : { text: n });
    const cells = [[name(r.names[0]), ...r.pairs.map(p => val(p[0]))], [name(r.names[1]), ...r.pairs.map((p, i) => (hideY || blanks.has(i) || hides(o, `y${i}`) ? null : val(p[1])))]];
    const boxes = cells.map(rw => rw.map(l => (l === null ? null : mathBox(l, FS, { lang }))));
    const frac = r.numbering === 'fraction', ch = frac ? 50 : 38, T = 18 + (d.heading ? 30 : 0), L = 16, n = r.pairs.length + 1, kids = [];
    const tw = Math.max(...boxes.flat().filter(Boolean).map(b => b.w)) + 24;
    const headW = Math.max(boxes[0][0].w, boxes[1][0].w) + 26, cw = Math.max(54, tw);
    let Wd, Hd;
    if (across) {
      const xs = [L, L + headW]; for (let k = 1; k < n; k++) xs.push(xs[k] + cw);
      const ys = [T, T + ch, T + 2 * ch];
      kids.push(node('rect', { x: L, y: T, width: headW, height: 2 * ch, fill: o.print ? '#E6E6E6' : P.soft }));
      for (const y of ys) kids.push(line(L, y, xs[n], y, P.ink, 2, { 'stroke-linecap': 'square' }));
      xs.forEach((x, k) => kids.push(line(x, T, x, T + 2 * ch, P.ink, k <= 1 || k === n ? 2 : 1.2, { 'stroke-linecap': 'square' })));
      boxes.forEach((rw, i) => rw.forEach((b, k) => { if (b) kids.push(mathNode(b, (xs[k] + xs[k + 1]) / 2 - b.w / 2, T + i * ch + ch / 2 + (b.asc - b.desc) / 2, { color: P.ink, cls: k ? 'of-cell' : 'of-head' })); }));
      Wd = xs[n] + 16; Hd = T + 2 * ch + 16;
    } else {
      const xs = [L, L + cw + 10, L + 2 * (cw + 10)], ys = [T]; for (let k = 0; k < n; k++) ys.push(ys[k] + ch);
      kids.push(node('rect', { x: L, y: T, width: xs[2] - L, height: ch, fill: o.print ? '#E6E6E6' : P.soft }));
      ys.forEach((y, k) => kids.push(line(L, y, xs[2], y, P.ink, k <= 1 || k === n ? 2 : 1.2, { 'stroke-linecap': 'square' })));
      for (const x of xs) kids.push(line(x, T, x, ys[n], P.ink, 2, { 'stroke-linecap': 'square' }));
      boxes.forEach((col, j) => col.forEach((b, k) => { if (b) kids.push(mathNode(b, (xs[j] + xs[j + 1]) / 2 - b.w / 2, ys[k] + ch / 2 + (b.asc - b.desc) / 2, { color: P.ink, cls: k ? 'of-cell' : 'of-head' })); }));
      Wd = xs[2] + 16; Hd = ys[n] + 16;
    }
    if (d.heading) { Wd = Math.max(Wd, ddTextW(d.heading, 16) + 30); kids.push(label(Wd / 2, 24, text(d.heading, 60), { anchor: 'middle', size: 16, colour: P.ink, cls: 'of-heading' })); }
    return frame(Wd, Hd, kids, { ...o, kind: 'tableOfValues' }, o.title || text(d.heading, 60) || W('tableOfValues'));
  },
};

export const PROB_KINDS = { treeDiagram, vennDiagram, twoWayTable, tableOfValues };
