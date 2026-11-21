// Oomba Figures: the geometry behind a solid's net. The 11 nets of a cube, as squares on a grid, and folding six squares
// up into a cube to see which face each becomes (so a net that does not fold into a cube is caught); then a solid's
// faces laid out flat in its own units: a prism's sides in a row with its two bases on one of them, a pyramid's base
// with a triangle on each edge, a cylinder's rectangle with a circle on each long side, a cone's sector with its base
// circle at the middle of its arc, a cube's six squares in one of its nets. Each corner of a flat face is named after the
// corner of the solid it folds up to, so an edge two faces share on the net is a fold, and two cut edges with the same
// corners are glued together when it is folded. Then glue tabs that never lie over a face or another tab, and the net
// scaled to fit, with its fold lines, cut edges, the lines its measures sit on and its labels. Pure numbers in, pure
// numbers out: figures/src/solids.js reads the data, checks it and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; a cube's net can also be any six squares the caller gives (nets that do
// not fold are refused by the caller through ntFoldCube, and ntWhichCubeNet names which of the 11 a net is, turned or
// flipped); the measures arrive as numbers from figures/src/ported/solids.js, not typed text; labels are laid out by
// Oomba's own math label typesetter through a callback (the caller decides what each part says), and face names and
// areas come from the caller; the face tints are left to the caller (print draws gray); the 3D shape beside the net,
// the label dragging and the label-size setting are left out (a scale factor instead).
const NT_FIT_W = 480;
const NT_FIT_H = 360;
const NT_PAD = 12;
const NT_SQUARE = 11;
const NT_EPS = 1e-6;

const ntAdd = (p, q) => [p[0] + q[0], p[1] + q[1]];
const ntSub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const ntMul = (p, k) => [p[0] * k, p[1] * k];
const ntDot = (p, q) => p[0] * q[0] + p[1] * q[1];
const ntCross = (p, q) => p[0] * q[1] - p[1] * q[0];
const ntLen = p => Math.hypot(p[0], p[1]);
const ntUnit = p => ntMul(p, 1 / (ntLen(p) || 1));
const ntPerp = p => [-p[1], p[0]];
const ntR1 = v => Math.round(v * 10) / 10;
const ntReach = (box, d) => (box.w / 2) * Math.abs(d[0]) + ((box.asc + box.desc) / 2) * Math.abs(d[1]);
const ntKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const ntNear = (p, q) => Math.abs(p[0] - q[0]) < NT_EPS && Math.abs(p[1] - q[1]) < NT_EPS;
const ntMid = (p, q) => ntMul(ntAdd(p, q), 0.5);
const ntCentroid = pts => ntMul(pts.reduce((t, p) => ntAdd(t, p), [0, 0]), 1 / pts.length);

/**
 * The 11 cube nets, each one once (no two are turns or mirror images of each other), as [column, row] squares, row 0 at
 * the top. Net 1 is the cross textbooks draw first; 1 to 6 have a row of four squares, 7 to 9 a row of three, 10 is the
 * staircase and 11 two rows of three.
 */
export const NT_CUBE_NETS = [
  [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]],
  [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2]],
  [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]],
  [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [2, 2]],
  [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [3, 2]],
  [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [2, 2]],
  [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [1, 2]],
  [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [2, 2]],
  [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [3, 2]],
  [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]],
  [[0, 0], [1, 0], [2, 0], [2, 1], [3, 1], [4, 1]],
];
/** A square's corners in order round it: top left, top right, bottom right, bottom left. */
export const ntCornersOf = ([c, r]) => [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]];

/**
 * Fold a net of squares up into a cube of side 1. -> each square's corners (in ntCornersOf's order) as names of the
 * cube's corners ("0,1,1"), or null when the squares do not fold into a cube: two land on the same face, or they are not
 * joined.
 */
export function ntFoldCube(cells) {
  if (!cells.length) return null;
  const key3 = p => p.map(c => Math.round(c)).join(',');
  const at = new Map(cells.map((cell, i) => [cell.join(','), i]));
  const placed = cells.map(() => null);
  placed[0] = { corners: ntCornersOf(cells[0]).map(([x, y]) => [x - cells[0][0], y - cells[0][1], 0]), inward: [0, 0, 1] };
  const queue = [0];
  // neighbours across each side: [column step, row step, the two corners on that side, the two across from them]
  const SIDES = [[0, -1, [0, 1], [3, 2]], [1, 0, [1, 2], [0, 3]], [0, 1, [3, 2], [0, 1]], [-1, 0, [0, 3], [1, 2]]];
  while (queue.length) {
    const i = queue.shift(), here = placed[i];
    for (const [dc, dr, shared, away] of SIDES) {
      const j = at.get(`${cells[i][0] + dc},${cells[i][1] + dr}`);
      if (j === undefined || placed[j]) continue;
      // the neighbour folds up toward the inside, about the side they share
      const a = here.corners[shared[0]], b = here.corners[away[0]], toward = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const corners = [], theirs = ntCornersOf(cells[j]), mine = ntCornersOf(cells[i]);
      theirs.forEach(([x, y], k) => { const same = mine.findIndex(([u, w]) => u === x && w === y); if (same >= 0) corners[k] = here.corners[same]; });
      theirs.forEach(([x, y], k) => {
        if (corners[k]) return;
        const back = theirs.findIndex(([u, w]) => u === x - dc && w === y - dr);
        corners[k] = [corners[back][0] + here.inward[0], corners[back][1] + here.inward[1], corners[back][2] + here.inward[2]];
      });
      placed[j] = { corners, inward: [-toward[0], -toward[1], -toward[2]] };
      queue.push(j);
    }
  }
  if (placed.some(p => !p)) return null;
  const faces = new Set(placed.map(p => p.corners.map(key3).sort().join(' ')));
  if (faces.size !== cells.length) return null;
  return placed.map(p => p.corners.map(key3));
}
/** A net turned and flipped every way, each as sorted text, to tell whether two nets are the same. */
export function ntShapesOf(cells) {
  const out = [];
  let cur = cells;
  for (let flip = 0; flip < 2; flip++) {
    for (let turn = 0; turn < 4; turn++) {
      cur = cur.map(([c, r]) => [r, -c]);
      const minC = Math.min(...cur.map(p => p[0])), minR = Math.min(...cur.map(p => p[1]));
      out.push(cur.map(([c, r]) => `${c - minC},${r - minR}`).sort().join(' '));
    }
    cur = cur.map(([c, r]) => [-c, r]);
  }
  return out;
}
/** Which of the 11 cube nets these squares are (1 to 11, turned or flipped), or 0. */
export function ntWhichCubeNet(cells) {
  const mine = new Set(ntShapesOf(cells));
  const i = NT_CUBE_NETS.findIndex(n => mine.has(ntShapesOf(n)[0]));
  return i + 1;
}

/** A face's area, in square units. */
export function ntAreaOf(f) {
  if (f.kind === 'circle') return Math.PI * f.r * f.r;
  if (f.kind === 'sector') return (f.r * f.r * (f.to - f.from)) / 2;
  return Math.abs(f.pts.reduce((t, p, i) => t + ntCross(p, f.pts[(i + 1) % f.pts.length]), 0)) / 2;
}
/** Where a face's name or area is written. */
export function ntMiddleOf(f) {
  if (f.kind === 'circle') return f.c;
  if (f.kind === 'sector') { const m = (f.from + f.to) / 2; return ntAdd(f.apex, ntMul([Math.cos(m), Math.sin(m)], f.r * 0.62)); }
  return ntCentroid(f.pts);
}
function ntBasePolygon(base, sides, v) {
  if (base === 'rectangle') return [[0, 0], [v.length, 0], [v.length, v.width], [0, v.width]];
  if (base === 'right') return [[0, 0], [v.triBase, 0], [0, v.triHeight]];
  if (base === 'isosceles') return [[0, 0], [v.triBase, 0], [v.triBase / 2, v.triHeight]];
  const R = v.side / (2 * Math.sin(Math.PI / sides));
  return Array.from({ length: sides }, (_, i) => { const a = -Math.PI / 2 - Math.PI / sides + (i * 2 * Math.PI) / sides; return [R * Math.cos(a), R * Math.sin(a)]; });
}
function ntBaseParts(base, sides) {
  if (base === 'rectangle') return ['length', 'width', 'length', 'width'];
  if (base === 'right') return ['triBase', 'hyp', 'triHeight'];
  if (base === 'isosceles') return ['triBase', 'hyp', 'hyp'];
  return Array.from({ length: sides }, () => 'side');
}
/** A polygon moved so its corners j and j + 1 land on a and b, the rest of it on the side of their line `side` points to. */
function ntPlaceOn(poly, j, a, b, side) {
  const p = poly[j], q = poly[(j + 1) % poly.length];
  const turn = Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.atan2(q[1] - p[1], q[0] - p[0]), c = Math.cos(turn), s = Math.sin(turn);
  let out = poly.map(x => { const d = ntSub(x, p); return ntAdd(a, [d[0] * c - d[1] * s, d[0] * s + d[1] * c]); });
  const t = ntUnit(ntSub(b, a));
  if (ntDot(ntSub(ntCentroid(out), a), side) - ntDot(ntSub(ntCentroid(out), a), t) * ntDot(t, side) < 0) {
    const nrm = ntPerp(t);
    out = out.map(x => ntSub(x, ntMul(nrm, 2 * ntDot(ntSub(x, a), nrm))));
  }
  return out;
}

/**
 * A solid's net laid flat in its own units (y down). form: { solid: 'cube' | 'prism' | 'pyramid' | 'cylinder' | 'cone',
 * base, sides, cells (a cube's six squares) }, v: every measure (a cube's edge is v.side), diameter (the circle's line is
 * a diameter). -> { faces, edges: [{ a, b, key, face, fold, tab }], edgeParts (Map key -> part), inner: [{ part, a, b,
 * face, square, dot, dashed }], rightAngles }
 */
export function ntUnfold(form, v, diameter) {
  const faces = [], edgeParts = new Map(), inner = [], rightAngles = [], straight = [];
  if (form.solid === 'cube') {
    const e = v.side, cells = form.cells, named = ntFoldCube(cells);
    cells.forEach((cell, i) => faces.push({ kind: 'poly', pts: ntCornersOf(cell).map(([x, y]) => [x * e, y * e]), ids: named[i] }));
    for (const f of named) f.forEach((a, k) => edgeParts.set(ntKey(a, f[(k + 1) % 4]), 'side'));
  } else if (form.solid === 'prism') {
    const base = ntBasePolygon(form.base, form.sides, v), n = base.length, parts = ntBaseParts(form.base, form.sides), h = v.height;
    const L = j => ntLen(ntSub(base[(j + 1) % n], base[j]));
    // the sides in a row, the bases on the one at m, which is the base's front edge
    const m = Math.floor((n - 1) / 2), order = Array.from({ length: n }, (_, i) => (((i - m) % n) + n) % n);
    let x = 0, capAt = [[0, 0], [0, 0]];
    order.forEach((j, i) => {
      const k = (j + 1) % n;
      faces.push({ kind: 'poly', pts: [[x, 0], [x + L(j), 0], [x + L(j), h], [x, h]], ids: [`t${j}`, `t${k}`, `b${k}`, `b${j}`] });
      if (i === m) capAt = [[x, 0], [x + L(j), 0]];
      x += L(j);
    });
    const [a, b] = capAt, top = ntPlaceOn(base, 0, a, b, [0, -1]), bottom = ntPlaceOn(base, 0, ntAdd(a, [0, h]), ntAdd(b, [0, h]), [0, 1]);
    faces.push({ kind: 'poly', pts: top, ids: base.map((_, i) => `t${i}`) }, { kind: 'poly', pts: bottom, ids: base.map((_, i) => `b${i}`) });
    parts.forEach((p, j) => {
      const k = (j + 1) % n;
      edgeParts.set(ntKey(`t${j}`, `t${k}`), p); edgeParts.set(ntKey(`b${j}`, `b${k}`), p); edgeParts.set(ntKey(`t${j}`, `b${j}`), 'height');
    });
    const topFace = faces.length - 2;
    if (form.base === 'isosceles') inner.push({ part: 'triHeight', a: ntMid(top[0], top[1]), b: top[2], face: topFace, square: true, dot: false, dashed: true });
    if (form.base === 'right') rightAngles.push([top[0], top[1], top[2]], [bottom[0], bottom[1], bottom[2]]);
    if (form.base === 'regular') {
      // the apothem, from the middle of the top base to its side furthest from the row
      const c = ntCentroid(top);
      let far = 0;
      top.forEach((_, i) => { if (ntMid(top[i], top[(i + 1) % n])[1] < ntMid(top[far], top[(far + 1) % n])[1] - NT_EPS) far = i; });
      inner.push({ part: 'apothem', a: c, b: ntMid(top[far], top[(far + 1) % n]), face: topFace, square: true, dot: true, dashed: false });
    }
  } else if (form.solid === 'pyramid') {
    // the base with its front edge at the bottom, and a triangle out from each edge
    const base = ntBasePolygon(form.base, form.sides, v).map(([x, y]) => [x, -y]), n = base.length, parts = ntBaseParts(form.base, form.sides), c = ntCentroid(base);
    faces.push({ kind: 'poly', pts: base, ids: base.map((_, i) => `b${i}`) });
    base.forEach((p, j) => {
      const q = base[(j + 1) % n], m = ntMid(p, q);
      let out = ntPerp(ntUnit(ntSub(q, p)));
      if (ntDot(out, ntSub(m, c)) < 0) out = ntMul(out, -1);
      const d = ntDot(ntSub(m, c), out), slant = Math.hypot(v.height, d), tip = ntAdd(m, ntMul(out, slant));
      faces.push({ kind: 'poly', pts: [p, q, tip], ids: [`b${j}`, `b${(j + 1) % n}`, 'apex'] });
      edgeParts.set(ntKey(`b${j}`, `b${(j + 1) % n}`), parts[j]);
      if (j === 0 || (j === 1 && form.base === 'rectangle')) inner.push({ part: j === 0 ? 'slant' : 'slantW', a: m, b: tip, face: faces.length - 1, square: true, dot: false, dashed: true });
    });
  } else if (form.solid === 'cylinder') {
    const r = v.radius, C = 2 * Math.PI * r, h = v.height;
    faces.push({ kind: 'poly', pts: [[0, 0], [C, 0], [C, h], [0, h]], ids: ['top', 'top', 'bottom', 'bottom'] });
    faces.push({ kind: 'circle', c: [C / 2, -r], r }, { kind: 'circle', c: [C / 2, h + r], r });
    edgeParts.set(ntKey('top', 'bottom'), 'height'); edgeParts.set(ntKey('top', 'top'), 'circ'); edgeParts.set(ntKey('bottom', 'bottom'), 'circ');
    const o = [C / 2, -r];
    inner.push({ part: 'radius', a: diameter ? [o[0] - r, o[1]] : o, b: [o[0] + r, o[1]], face: 1, square: false, dot: !diameter, dashed: false });
  } else {
    const r = v.radius, sl = v.slant, theta = (2 * Math.PI * r) / sl, from = Math.PI / 2 - theta / 2, to = Math.PI / 2 + theta / 2, apex = [0, 0];
    faces.push({ kind: 'sector', apex, r: sl, from, to }, { kind: 'circle', c: [0, sl + r], r });
    for (const t of [to, from]) straight.push({ a: apex, b: ntMul([Math.cos(t), Math.sin(t)], sl), key: ntKey('apex', 'rim'), face: 0 });
    edgeParts.set(ntKey('apex', 'rim'), 'slant');
    const o = [0, sl + r];
    inner.push({ part: 'radius', a: diameter ? [o[0] - r, o[1]] : o, b: [o[0] + r, o[1]], face: 1, square: false, dot: !diameter, dashed: false });
  }
  // each straight edge, and whether it is a fold: shared, the same way round, by two faces on the net
  const all = [...straight];
  faces.forEach((f, fi) => { if (f.kind === 'poly') f.pts.forEach((p, k) => all.push({ a: p, b: f.pts[(k + 1) % f.pts.length], key: ntKey(f.ids[k], f.ids[(k + 1) % f.ids.length]), face: fi })); });
  const edges = all.map(e => ({ ...e, tab: false, fold: all.some(o => o !== e && o.key === e.key && o.face !== e.face && ((ntNear(o.a, e.a) && ntNear(o.b, e.b)) || (ntNear(o.a, e.b) && ntNear(o.b, e.a)))) }));
  return { faces, edges, edgeParts, inner, rightAngles };
}

// ---- glue tabs
/** A face as convex pieces: itself, a circle as a many-sided polygon, a sector as a fan. */
function ntPieces(f) {
  if (f.kind === 'poly') return [f.pts];
  if (f.kind === 'circle') return [Array.from({ length: 32 }, (_, i) => ntAdd(f.c, ntMul([Math.cos((i * Math.PI) / 16), Math.sin((i * Math.PI) / 16)], f.r)))];
  const steps = Math.max(2, Math.ceil(((f.to - f.from) / Math.PI) * 12));
  const rim = Array.from({ length: steps + 1 }, (_, i) => ntAdd(f.apex, ntMul([Math.cos(f.from + ((f.to - f.from) * i) / steps), Math.sin(f.from + ((f.to - f.from) * i) / steps)], f.r)));
  return rim.slice(1).map((p, i) => [f.apex, rim[i], p]);
}
/** Whether two convex polygons overlap by more than a sliver (touching does not count). */
function ntOverlaps(A, B, slack) {
  for (const poly of [A, B]) for (let i = 0; i < poly.length; i++) {
    const axis = ntUnit(ntPerp(ntSub(poly[(i + 1) % poly.length], poly[i]))), pa = A.map(p => ntDot(p, axis)), pb = B.map(p => ntDot(p, axis));
    if (Math.max(...pa) <= Math.min(...pb) + slack || Math.max(...pb) <= Math.min(...pa) + slack) return false;
  }
  return true;
}
/** Tabs for gluing: one on one edge of each pair of cut edges that meet when folded, where it has room; teeth round circles. */
function ntTabs(net, depth) {
  const tabs = [], blocks = net.faces.flatMap(ntPieces), slack = depth * 0.02;
  const clear = tab => !blocks.some(b => ntOverlaps(tab, b, slack)) && !tabs.some(t => ntOverlaps(tab, t, slack));
  const tabOn = e => {
    const t = ntSub(e.b, e.a), l = ntLen(t);
    let nrm = ntUnit(ntPerp(t));
    if (ntDot(nrm, ntSub(ntMid(e.a, e.b), ntMiddleOf(net.faces[e.face]))) < 0) nrm = ntMul(nrm, -1);
    const d = Math.min(depth, 0.4 * l), inset = Math.min(d, 0.3 * l), u = ntUnit(t);
    return [e.a, ntAdd(ntAdd(e.a, ntMul(nrm, d)), ntMul(u, inset)), ntAdd(ntSub(e.b, ntMul(u, inset)), ntMul(nrm, d)), e.b];
  };
  const done = new Set();
  for (const e of net.edges) {
    if (e.fold || done.has(e.key)) continue;
    const pair = net.edges.filter(o => !o.fold && o.key === e.key);
    if (pair.length !== 2) continue;
    done.add(e.key);
    for (const choice of pair) { const tab = tabOn(choice); if (clear(tab)) { choice.tab = true; tabs.push(tab); break; } }
  }
  for (const f of net.faces) {
    if (f.kind !== 'circle') continue;
    const count = 12, step = (2 * Math.PI) / count;
    for (let i = 0; i < count; i++) {
      const a0 = i * step + step * 0.12, a1 = (i + 1) * step - step * 0.12, at = (a, r) => ntAdd(f.c, ntMul([Math.cos(a), Math.sin(a)], r)), d = Math.min(depth, f.r * 0.45);
      const tooth = [at(a0, f.r), at(a0 + step * 0.15, f.r + d), at(a1 - step * 0.15, f.r + d), at(a1, f.r)];
      const outside = [at(a0, f.r * 1.02), tooth[1], tooth[2], at(a1, f.r * 1.02)];
      if (!blocks.some(b => ntOverlaps(outside, b, slack)) && !tabs.some(t => ntOverlaps(outside, t, slack))) tabs.push(tooth);
    }
  }
  return tabs;
}

/**
 * Lay a net out. spec: { form, v, diameter, tabs (glue tabs), faceText: { names, areas } (what is written in each face:
 * faceText(name, area) -> [boxes]), content(part) -> a math box or null, scale, lang }. -> { frame, faces: [{ kind, d,
 * name, area, group }], folds, cuts, curves, tabs, extras, squares, dots, arcs, labels, faceAreas }
 */
export function layoutNet(spec) {
  const k = spec.scale || 1, net = ntUnfold(spec.form, spec.v, spec.diameter);
  const signature = f => (f.kind === 'circle' ? `c${f.r.toFixed(4)}` : f.kind === 'sector' ? 's'
    : f.pts.map((p, i) => ntLen(ntSub(f.pts[(i + 1) % f.pts.length], p)).toFixed(4)).sort().join(',') + `:${ntAreaOf(f).toFixed(4)}`);
  const groups = [...new Set(net.faces.map(signature))];
  const typical = Math.sqrt(net.faces.reduce((t, f) => t + ntAreaOf(f), 0) / net.faces.length);
  const tabs = spec.tabs ? ntTabs(net, typical * 0.22) : [];

  // scaled to fit
  const raw = [];
  for (const f of net.faces) { if (f.kind === 'poly') raw.push(...f.pts); else if (f.kind === 'circle') raw.push(ntSub(f.c, [f.r, f.r]), ntAdd(f.c, [f.r, f.r])); else raw.push(...ntPieces(f).flat()); }
  raw.push(...tabs.flat());
  const xs = raw.map(p => p[0]), ys = raw.map(p => p[1]);
  const scale = k * Math.min(NT_FIT_W / (Math.max(...xs) - Math.min(...xs) || 1), NT_FIT_H / (Math.max(...ys) - Math.min(...ys) || 1));
  const x0 = Math.min(...xs), y0 = Math.min(...ys), at = p => [(p[0] - x0) * scale, (p[1] - y0) * scale];

  // faces named A, B, C ... in reading order
  const order = net.faces.map((f, i) => i).sort((i, j) => { const a = ntMiddleOf(net.faces[i]), b = ntMiddleOf(net.faces[j]); return Math.abs(a[1] - b[1]) > NT_EPS ? a[1] - b[1] : a[0] - b[0]; });
  const nameOf = new Map(order.map((fi, n) => [fi, String.fromCharCode(65 + (n % 26))]));
  const faces = net.faces.map((f, i) => {
    const base = { name: nameOf.get(i), area: ntAreaOf(f), group: groups.indexOf(signature(f)), kind: f.kind };
    if (f.kind === 'poly') return { ...base, d: `M${f.pts.map(p => at(p).map(ntR1).join(',')).join(' L')} Z` };
    if (f.kind === 'circle') { const c = at(f.c), R = ntR1(f.r * scale); return { ...base, d: `M${ntR1(c[0] - f.r * scale)},${ntR1(c[1])} a${R},${R} 0 1 0 ${ntR1(2 * f.r * scale)},0 a${R},${R} 0 1 0 ${ntR1(-2 * f.r * scale)},0 Z` }; }
    const a = at(f.apex), p = at(ntAdd(f.apex, ntMul([Math.cos(f.from), Math.sin(f.from)], f.r))), q = at(ntAdd(f.apex, ntMul([Math.cos(f.to), Math.sin(f.to)], f.r))), R = ntR1(f.r * scale);
    return { ...base, d: `M${ntR1(a[0])},${ntR1(a[1])} L${ntR1(p[0])},${ntR1(p[1])} A${R},${R} 0 ${f.to - f.from > Math.PI ? 1 : 0} 1 ${ntR1(q[0])},${ntR1(q[1])} Z` };
  });
  // each fold drawn once; cut edges are the faces' outlines
  const folds = [], seen = new Set();
  for (const e of net.edges) {
    if (!(e.fold || e.tab)) continue;
    const id = [at(e.a), at(e.b)].map(p => p.map(ntR1).join(',')).sort().join(' ');
    if (seen.has(id)) continue;
    seen.add(id); folds.push({ a: at(e.a), b: at(e.b) });
  }
  const cuts = net.edges.filter(e => !e.fold && !e.tab).map(e => ({ a: at(e.a), b: at(e.b) }));
  const curves = net.faces.flatMap((f, i) => {
    if (f.kind === 'circle') return [faces[i].d];
    if (f.kind !== 'sector') return [];
    const p = at(ntAdd(f.apex, ntMul([Math.cos(f.from), Math.sin(f.from)], f.r))), q = at(ntAdd(f.apex, ntMul([Math.cos(f.to), Math.sin(f.to)], f.r))), R = ntR1(f.r * scale);
    return [`M${ntR1(p[0])},${ntR1(p[1])} A${R},${R} 0 ${f.to - f.from > Math.PI ? 1 : 0} 1 ${ntR1(q[0])},${ntR1(q[1])}`];
  });
  const extras = [], squares = [], dots = [], arcs = [];
  const square = (foot, t1, t2) => {
    if (!spec.square) return;
    const u1 = ntUnit(ntSub(t1, foot)), u2 = ntUnit(ntSub(t2, foot)), q = Math.min(NT_SQUARE, 0.35 * ntLen(ntSub(t1, foot)), 0.35 * ntLen(ntSub(t2, foot)));
    squares.push([ntAdd(foot, ntMul(u1, q)), ntAdd(foot, ntAdd(ntMul(u1, q), ntMul(u2, q))), ntAdd(foot, ntMul(u2, q))]);
  };
  for (const [c, p, q] of net.rightAngles) square(at(c), at(p), at(q));

  // labels
  const labels = [];
  const overlaps = (box, [cx, cy]) => labels.some(l => Math.abs(l.cx - cx) < (l.box.w + box.w) / 2 + 3 && Math.abs(l.cy - cy) < (l.box.asc + l.box.desc + box.asc + box.desc) / 2 + 2);
  const place = (part, box, center, along, slide = 0) => {
    if (!box) return;
    for (let i = 1; slide && overlaps(box, center) && i * 8 <= slide; i++) {
      const tries = [ntAdd(center, ntMul(along, i * 8)), ntAdd(center, ntMul(along, -i * 8))].filter(c => !overlaps(box, c));
      if (tries.length) center = tries[0];
    }
    labels.push({ part, box, cx: center[0], cy: center[1], x: center[0] - box.w / 2, y: center[1] + (box.asc - box.desc) / 2 });
  };
  const content = part => spec.content(part);
  const faceMid = fi => at(ntMiddleOf(net.faces[fi]));
  const innerSide = l => (l.part !== 'radius' && Math.abs(ntUnit(ntSub(l.b, l.a))[1]) > 0.5 ? [1, 0] : [0, -1]);
  const labelBeside = (part, box, a, b, toward, along = 0.5) => {
    if (!box) return;
    const t = ntUnit(ntSub(b, a)), m = ntAdd(a, ntMul(ntSub(b, a), along));
    let nrm = ntPerp(t);
    if (ntDot(nrm, toward) < 0) nrm = ntMul(nrm, -1);
    place(part, box, ntAdd(m, ntMul(nrm, 6 + ntReach(box, nrm))), t, 0.4 * ntLen(ntSub(b, a)));
  };

  // names and areas in the faces, clear of a line drawn in the face
  if (spec.faceText) order.forEach(fi => {
    const parts = spec.faceText(nameOf.get(fi), ntAreaOf(net.faces[fi]), fi).filter(Boolean);
    if (!parts.length) return;
    let m = faceMid(fi);
    const ln = net.inner.find(l => l.face === fi && content(l.part));
    if (ln) {
      const a = at(ln.a), b = at(ln.b);
      let away = ntPerp(ntUnit(ntSub(b, a)));
      if (ntDot(away, innerSide(ln)) > 0) away = ntMul(away, -1);
      const w = Math.max(...parts.map(p => p.w)), h = parts.reduce((t, p) => t + p.asc + p.desc + 4, -4);
      const need = ntReach({ w, asc: h / 2, desc: h / 2 }, away) + 8 - ntDot(ntSub(m, a), away);
      if (need > 0) m = ntAdd(m, ntMul(away, need));
    }
    const total = parts.reduce((t, p) => t + p.asc + p.desc + 4, -4);
    let y = m[1] - total / 2;
    parts.forEach((p, i) => { y += p.asc + p.desc; place(`${i ? 'a' : 'f'}${nameOf.get(fi)}`, p, [m[0], y - (p.asc + p.desc) / 2], [1, 0]); y += 4; });
  });

  // measures along edges: outside a cut edge, toward the bottom or left of the net where it can; inside a face along a fold
  const used = new Set();
  const outward = e => { let nrm = ntUnit(ntPerp(ntSub(e.b, e.a))); if (ntDot(nrm, ntSub(ntMid(e.a, e.b), ntMiddleOf(net.faces[e.face]))) < 0) nrm = ntMul(nrm, -1); return nrm; };
  const score = e => {
    const nrm = outward(e), m = ntMid(e.a, e.b);
    if (e.fold || e.tab) return -100 + m[1] * 1e-3;
    if (nrm[1] > 0.7) return 40 + m[1] * 1e-3;
    if (nrm[0] < -0.7) return 30 - m[0] * 1e-3;
    if (nrm[1] < -0.7) return 20 - m[1] * 1e-3;
    return 10 + m[0] * 1e-3;
  };
  for (const part of ['length', 'width', 'triBase', 'triHeight', 'hyp', 'side', 'height', 'slant', 'circ']) {
    const box = content(part);
    if (!box || net.inner.some(i => i.part === part)) continue;
    const candidates = net.edges.filter(e => net.edgeParts.get(e.key) === part && !used.has(e));
    if (!candidates.length) continue;
    const best = candidates.reduce((b, e) => (score(e) > score(b) + 1e-9 ? e : b));
    for (const e of net.edges) if (e.key === best.key) used.add(e);
    const a = at(best.a), b = at(best.b);
    if (!best.fold && !best.tab) labelBeside(part, box, a, b, outward(best), part === 'circ' ? (a[0] < b[0] ? 0.2 : 0.8) : 0.5);
    else {
      const sharing = net.edges.filter(e => e.key === best.key && ((ntNear(e.a, best.a) && ntNear(e.b, best.b)) || (ntNear(e.a, best.b) && ntNear(e.b, best.a))));
      const face = sharing.map(e => e.face).reduce((f, g) => (ntAreaOf(net.faces[g]) > ntAreaOf(net.faces[f]) + NT_EPS ? g : f));
      labelBeside(part, box, a, b, ntSub(faceMid(face), ntMid(a, b)));
    }
  }
  // measures on lines of their own inside a face
  for (const ln of net.inner) {
    const box = content(ln.part);
    if (!box) continue;
    const a = at(ln.a), b = at(ln.b);
    extras.push({ a, b, dashed: ln.dashed, part: ln.part });
    if (ln.dot) dots.push(a);
    if (ln.square) {
      const f = net.faces[ln.face];
      if (f.kind === 'poly') {
        const foot = ln.part === 'apothem' ? b : a, other = ln.part === 'apothem' ? a : b;
        const side = f.pts.map(at).find(p => Math.abs(ntDot(ntUnit(ntSub(p, foot)), ntUnit(ntSub(other, foot)))) < 0.05 && ntLen(ntSub(p, foot)) > 1);
        if (side) square(foot, other, side);
      }
    }
    labelBeside(ln.part, box, a, b, innerSide(ln), ln.part === 'slant' || ln.part === 'slantW' ? 0.32 : 0.5);
  }
  // a cone's sector angle, marked at its tip
  if (spec.form.solid === 'cone') {
    const box = content('angle'), f = net.faces[0];
    if (box && f.kind === 'sector') {
      const tip = at(f.apex), R = Math.min(28, f.r * scale * 0.25);
      const p = ntAdd(tip, ntMul([Math.cos(f.from), Math.sin(f.from)], R)), q = ntAdd(tip, ntMul([Math.cos(f.to), Math.sin(f.to)], R));
      arcs.push(`M${ntR1(p[0])},${ntR1(p[1])} A${ntR1(R)},${ntR1(R)} 0 ${f.to - f.from > Math.PI ? 1 : 0} 1 ${ntR1(q[0])},${ntR1(q[1])}`);
      place('angle', box, ntAdd(tip, ntMul([0, 1], R + 6 + ntReach(box, [0, 1]))), [1, 0]);
    }
  }
  const pts = [...raw.map(at), ...extras.flatMap(e => [e.a, e.b])];
  for (const l of labels) pts.push([l.cx - l.box.w / 2, l.y - l.box.asc], [l.cx + l.box.w / 2, l.y + l.box.desc]);
  const minX = Math.min(...pts.map(p => p[0])) - NT_PAD, minY = Math.min(...pts.map(p => p[1])) - NT_PAD;
  const maxX = Math.max(...pts.map(p => p[0])) + NT_PAD, maxY = Math.max(...pts.map(p => p[1])) + NT_PAD;
  return { frame: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, faces, folds, cuts, curves, tabs: tabs.map(t => t.map(at)), extras, squares, dots, arcs, labels, faceAreas: net.faces.map(ntAreaOf), groups: groups.length };
}
