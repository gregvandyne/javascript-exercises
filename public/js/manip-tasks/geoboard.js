// Geoboard: the tool's 16 tasks as practice (docs/manip-practice-tasks.md). As in rekenreks.js: each task keeps its
// title, code, grade and notes; make(R) gives one variation; conds are this tool's board checks, read from the board's
// geoboard objects: each closed band (Close the band; st.bands [{ pts: [{ x, y }], color }]) is a shape. The band being
// stretched (st.band) is not a shape yet. Pegs on the square board are x 0..5 across and y 0..5 down (manip.js geoPegs),
// one unit apart; the circular board has 12 rim pegs and its center (3, 3). A shape is read with its repeated pegs and
// straight-through pegs taken out, so tapping a peg in the middle of a side changes nothing. Every variation hides the
// board's totals ("Area about 4.0" would give the answers away).
import { boardWith, rowPlaces, objSizeOf, plural } from '../manip-task-kit.js';

export const SLUG = 'geoboard';
const COLORS = { Red: '#E53935', Blue: '#1E88E5', Green: '#43A047', Orange: '#FB8C00', Purple: '#8E24AA' };
const RED = COLORS.Red;

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
/** The circular board's pegs (manip.js geoPegs): 12 on the rim from the right going clockwise, then the center. */
export const circlePegs = () => [...Array.from({ length: 12 }, (_, i) => ({ x: 3 + 2.6 * Math.cos((i * Math.PI) / 6), y: 3 + 2.6 * Math.sin((i * Math.PI) / 6) })), { x: 3, y: 3 }];
/** A geoboard's state: bands [[x, y], ...] (closed), board, label, q (read only). */
const geoSt = ({ bands = [], board = 'square', label = '', q = false, color = RED } = {}) => ({
  board, band: [], bands: bands.map(b => ({ pts: (b.pts || b).map(([x, y]) => ({ x, y })), color: b.color || RED })), color, fill: true,
  ...(label ? { label } : {}), ...(q ? { q: true } : {}) });
/** A board with these geoboards side by side (ids g1, g2, ...). Put a read-only one first: the palette works on the
 *  last one (or the one tapped). */
export function geoBoard(list) {
  const sts = list.map(geoSt), places = rowPlaces(sts.map(st => objSizeOf(SLUG, SLUG, st)));
  return boardWith(SLUG, sts.map((st, i) => ({ id: `g${i + 1}`, k: SLUG, x: places[i].x, y: places[i].y, s: 1, st })));
}
/** The same board with these bands added to the last geoboard (the solutions): [{ pts: [[x, y]...], color? }]. */
function solved(setup, bands) {
  const b = JSON.parse(JSON.stringify(setup)), o = b.objects.filter(x => x.k === SLUG).pop();
  for (const band of bands) o.st.bands.push({ pts: (band.pts || band).map(([x, y]) => ({ x, y })), color: band.color || RED });
  return b;
}

// ---------------------------------------------------------------- shapes
const EPS = 1e-6;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const same = (a, b) => Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3;
/** A band's pegs without repeats (next to each other, or the last back on the first). */
function dedupe(pts) {
  const out = [];
  for (const p of pts) if (!out.length || !same(out[out.length - 1], p)) out.push(p);
  while (out.length > 1 && same(out[0], out[out.length - 1])) out.pop();
  return out;
}
/** ...and without pegs a side runs straight through. */
function corners(pts) {
  let out = dedupe(pts), again = true;
  while (again && out.length > 2) {
    again = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
      if (Math.abs(cross(sub(b, a), sub(c, b))) < EPS) { out.splice(i, 1); again = true; break; }
    }
  }
  return out;
}
const signedArea = P => P.reduce((s, p, i) => s + cross(p, P[(i + 1) % P.length]), 0) / 2;
/** The inside angle at each corner of a closed shape, in degrees (a corner pointing in is more than 180). */
function anglesOf(P) {
  const o = Math.sign(signedArea(P)) || 1;
  return P.map((v, i) => {
    const a = sub(P[(i - 1 + P.length) % P.length], v), b = sub(P[(i + 1) % P.length], v);
    const ang = (Math.atan2(Math.abs(cross(a, b)), a.x * b.x + a.y * b.y) * 180) / Math.PI;
    const turn = cross(sub(v, P[(i - 1 + P.length) % P.length]), sub(P[(i + 1) % P.length], v));
    return turn * o >= 0 ? ang : 360 - ang;
  });
}
const len2 = v => v.x * v.x + v.y * v.y;
const near = (a, b, e = 0.01) => Math.abs(a - b) < e;
/** Unit squares inside a shape with its sides on the grid lines: "x,y" of each square's top left peg. */
function cellsIn(P) {
  const xs = P.map(p => p.x), ys = P.map(p => p.y), out = [];
  for (let x = Math.floor(Math.min(...xs)); x < Math.max(...xs); x++) for (let y = Math.floor(Math.min(...ys)); y < Math.max(...ys); y++) {
    const cx = x + 0.5, cy = y + 0.5; let inside = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a.y > cy) !== (b.y > cy) && cx < ((b.x - a.x) * (cy - a.y)) / (b.y - a.y) + a.x) inside = !inside; }
    if (inside) out.push([x, y]);
  }
  return out;
}
/** A set of unit squares the same way however it is turned or flipped: its smallest form as text. */
export function canonCells(cells) {
  const forms = [];
  for (let k = 0; k < 8; k++) {
    const t = cells.map(([x, y]) => { let a = k & 1 ? [y, x] : [x, y]; if (k & 2) a = [-a[0], a[1]]; if (k & 4) a = [a[0], -a[1]]; return a; });
    const mx = Math.min(...t.map(a => a[0])), my = Math.min(...t.map(a => a[1]));
    forms.push(t.map(([x, y]) => `${x - mx},${y - my}`).sort().join(' '));
  }
  return forms.sort()[0];
}
/** What the checks need to know about one closed band. */
export function shapeOf(band) {
  const raw = dedupe((Array.isArray(band && band.pts) ? band.pts : []).filter(p => p && typeof p === 'object').map(p => ({ x: num(p.x), y: num(p.y) })));
  const P = corners(raw);
  if (P.length < 3) return null;
  const area = Math.abs(signedArea(P));
  if (area < EPS) return null;
  const edges = P.map((p, i) => sub(P[(i + 1) % P.length], p)), angles = anglesOf(P);
  const axis = edges.every(e => Math.abs(e.x) < EPS || Math.abs(e.y) < EPS);
  const perim = edges.reduce((s, e) => s + Math.sqrt(len2(e)), 0);
  const L = edges.map(len2);
  return { P, raw, area, n: P.length, edges, angles, axis, perim, L, color: String((band && band.color) || '').toUpperCase(),
    sig: `${P.length}|${[...L].map(x => x.toFixed(3)).sort().join(',')}|${angles.map(a => a.toFixed(1)).sort().join(',')}`,
    cells: axis && P.every(p => Number.isInteger(p.x) && Number.isInteger(p.y)) ? canonCells(cellsIn(P)) : '' };
}
const parallel = (a, b) => Math.abs(cross(a, b)) < EPS;
/** Does a shape fit a spec? spec: { sides, area, square, rect: [a, b], right (true: a right angle; false: none), obtuse,
 *  acute, legs: [a, b] (the sides at the right angle), iso, base: b (a side b long, the other two equal), angle: deg (a
 *  corner of that size), axis (sides on the grid lines), perim, perimMin, cells (this polyomino, any turn), notCells,
 *  verts: [[x, y]...] (exactly these corners), color, pairs: parallel pairs of sides (4 sides), step: [a, b] (a side
 *  going a across and b up or down), lens: [a, b] (the parallel sides' lengths), center: deg (the inside angle at the
 *  circular board's center peg) }. */
export function fits(s, spec) {
  if (!s) return false;
  const has = k => spec[k] !== undefined;
  if (has('sides') && s.n !== spec.sides) return false;
  if (has('area') && !near(s.area, spec.area)) return false;
  if (has('color') && s.color !== String(spec.color).toUpperCase()) return false;
  if (has('axis') && spec.axis && !s.axis) return false;
  if (has('perim') && !(s.axis && near(s.perim, spec.perim))) return false;
  if (has('perimMin') && !(s.axis && s.perim > spec.perimMin + EPS)) return false;
  const rightAt = s.angles.map(a => near(a, 90, 0.5));
  if (has('right') && rightAt.some(Boolean) !== !!spec.right) return false;
  if (spec.obtuse && !s.angles.some(a => a > 90.5 && a < 179.5)) return false;
  if (spec.acute && !s.angles.every(a => a < 89.5)) return false;
  if (has('legs')) {
    const want = [...spec.legs].map(x => x * x).sort((a, b) => a - b);
    const ok = s.P.some((_, i) => rightAt[i] && (() => { const g = [s.L[i], s.L[(i - 1 + s.n) % s.n]].sort((a, b) => a - b); return near(g[0], want[0]) && near(g[1], want[1]); })());
    if (!ok) return false;
  }
  if (spec.iso && !(s.n === 3 && (near(s.L[0], s.L[1]) || near(s.L[1], s.L[2]) || near(s.L[0], s.L[2])))) return false;
  if (has('base') && !(s.n === 3 && [0, 1, 2].some(i => near(s.L[i], spec.base * spec.base) && near(s.L[(i + 1) % 3], s.L[(i + 2) % 3])))) return false;
  if (has('angle') && !s.angles.some(a => near(a, spec.angle, 0.5))) return false;
  if (spec.square && !(s.n === 4 && rightAt.every(Boolean) && s.L.every(l => near(l, s.L[0])))) return false;
  if (spec.rectAny && !(s.n === 4 && rightAt.every(Boolean))) return false;
  if (has('rect')) {
    const w = [...spec.rect].map(x => x * x).sort((a, b) => a - b), g = [...s.L].sort((a, b) => a - b);
    if (!(s.n === 4 && rightAt.every(Boolean) && near(g[0], w[0]) && near(g[1], w[0]) && near(g[2], w[1]) && near(g[3], w[1]))) return false;
  }
  if (has('cells') && s.cells !== spec.cells) return false;
  if (has('notCells') && (!s.cells || s.cells === spec.notCells)) return false;
  if (has('verts')) {
    const want = spec.verts.map(([x, y]) => ({ x, y }));
    if (s.n !== want.length || !want.every(w => s.P.some(p => same(p, w)))) return false;
  }
  if (has('pairs')) {
    if (s.n !== 4) return false;
    const k = (parallel(s.edges[0], s.edges[2]) ? 1 : 0) + (parallel(s.edges[1], s.edges[3]) ? 1 : 0);
    if (k !== spec.pairs) return false;
  }
  if (has('step') && !s.edges.some(e => [[1, 1], [1, -1]].some(([sx, sy]) => parallel(e, { x: spec.step[0] * sx, y: spec.step[1] * sy }) && near(len2(e), spec.step[0] ** 2 + spec.step[1] ** 2)))) return false;
  if (has('lens')) {
    const pairs = [[0, 2], [1, 3]].filter(([i, j]) => s.n === 4 && parallel(s.edges[i], s.edges[j]));
    const w = [...spec.lens].map(x => x * x).sort((a, b) => a - b);
    if (!pairs.some(([i, j]) => { const g = [s.L[i], s.L[j]].sort((a, b) => a - b); return near(g[0], w[0]) && near(g[1], w[1]); })) return false;
  }
  if (has('center')) {
    const P = s.raw, i = P.findIndex(p => same(p, { x: 3, y: 3 }));
    if (i < 0 || P.filter(p => same(p, { x: 3, y: 3 })).length > 1) return false;
    const a = anglesOf(P)[i];
    if (!near(a, spec.center, 0.5)) return false;
  }
  return true;
}
/** The closed bands of the geoboard a check is about: by its label, else the last one a student can use. */
function shapesOn(c, board) {
  const gs = ((board && Array.isArray(board.objects)) ? board.objects : []).filter(o => o && o.k === SLUG && o.st && typeof o.st === 'object');
  const g = c.label ? gs.find(o => o.st.label === c.label) : gs.filter(o => !o.st.q).pop();
  return g && Array.isArray(g.st.bands) ? g.st.bands.map(shapeOf).filter(Boolean) : [];
}

// ---------------------------------------------------------------- the checks
export const conds = {
  /** Closed bands that fit each spec of want, a different band for each (different: no two the same shape; grow: each
   *  one's area bigger than the one before). */
  shapes: (c, b) => {
    const list = shapesOn(c, b), want = Array.isArray(c.want) ? c.want : [], used = [];
    const ok = i => {
      if (i === want.length) return true;
      for (let j = 0; j < list.length; j++) {
        if (used.includes(j) || !fits(list[j], want[i])) continue;
        if (c.different && used.some(u => list[u].sig === list[j].sig)) continue;
        if (c.grow && i > 0 && !(list[j].area > list[used[i - 1]].area + EPS)) continue;
        used.push(j); if (ok(i + 1)) return true; used.pop();
      }
      return false;
    };
    return want.length > 0 && ok(0);
  },
};

// ---------------------------------------------------------------- shapes made of unit squares
/** The outline of a set of unit squares (one piece, no holes, no corner-only touches) as its corners in order, or null. */
export function outlineOf(cells) {
  const key = (x, y) => `${x},${y}`, set = new Set(cells.map(([x, y]) => key(x, y))), edges = new Map();
  const add = (a, b) => { const k = `${a}>${b}`, r = `${b}>${a}`; if (edges.has(r)) edges.delete(r); else edges.set(k, [a, b]); };
  for (const [x, y] of cells) { add(key(x, y), key(x + 1, y)); add(key(x + 1, y), key(x + 1, y + 1)); add(key(x + 1, y + 1), key(x, y + 1)); add(key(x, y + 1), key(x, y)); }
  const from = new Map();
  for (const [a, b] of edges.values()) { if (from.has(a)) return null; from.set(a, b); }
  if (!set.size) return null;
  const start = from.keys().next().value, loop = [start];
  for (let p = from.get(start); p !== start; p = from.get(p)) { loop.push(p); if (loop.length > edges.size) return null; }
  if (loop.length !== edges.size) return null;
  return corners(loop.map(s => { const [x, y] = s.split(',').map(Number); return { x, y }; })).map(p => [p.x, p.y]);
}
const perimOf = cells => { const s = new Set(cells.map(([x, y]) => `${x},${y}`)); let n = 0; for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!s.has(`${x + dx},${y + dy}`)) n++; return n; };
/** A random shape of n unit squares on the 5 by 5 board that ok(cells, perimeter) accepts (tree: each new square
 *  touches just one other, for long thin shapes). -> { cells, pts, perim } or null */
function polyomino(R, n, ok = () => true, { tree = false, tries = 400 } = {}) {
  for (let t = 0; t < tries; t++) {
    const cells = [[R.int(0, 4), R.int(0, 4)]], has = new Set([cells[0].join(',')]);
    while (cells.length < n) {
      const opts = [];
      for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = x + dx, b = y + dy, k = `${a},${b}`;
        if (a < 0 || b < 0 || a > 4 || b > 4 || has.has(k)) continue;
        if (tree && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([ex, ey]) => has.has(`${a + ex},${b + ey}`)).length !== 1) continue;
        opts.push([a, b]);
      }
      if (!opts.length) break;
      const c = R.pick(opts); cells.push(c); has.add(c.join(','));
    }
    if (cells.length < n) continue;
    const pts = outlineOf(cells), perim = perimOf(cells);
    if (pts && ok(cells, perim)) return { cells, pts, perim };
  }
  return null;
}
/** The near-square shape of n unit squares: rows of w = ceil(sqrt n) (the smallest perimeter for n). */
function compact(n) {
  const w = Math.ceil(Math.sqrt(n)), cells = [];
  for (let i = 0; i < n; i++) cells.push([i % w, Math.floor(i / w)]);
  return { cells, pts: outlineOf(cells), perim: perimOf(cells) };
}
const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const fmtA = a => String(+a.toFixed(2));
/** Peg coordinates with (0, 0) at the bottom left (the board's own y counts down from the top). */
const xy = ([x, y]) => `(${x}, ${5 - y})`;

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
const ONE = [{}];
const shapeCheck = (want, say, extra = {}) => [{ t: 'shapes', want, say, ...extra }];
const shuffled = (R, options, right) => { const o = R.shuffle(options); return { options: o, correct: o.indexOf(right) }; };
const cornerHint = 'Tap the pegs at the corners in order, then pick Close the band.';

export const TASKS = [
  T('squares-of-many-sizes', 'Squares of many sizes', '3.MD.C.6', '3',
    'Make three squares of the sizes asked for. Count unit squares to find the area of one of them.',
    'Tilted squares are the stretch goal: a diamond square has area 2, found by the surrounding box or by splitting into triangles.',
    R => {
      const s = R.shuffle([1, 2, 3, 4, 5]).slice(0, 3).sort((a, b) => a - b), ask = R.int(0, 2), which = ['smallest', 'middle', 'biggest'][ask];
      const setup = geoBoard(ONE), a = s[ask] ** 2;
      return {
        prompt: `Make three squares with sides ${s[0]}, ${s[1]} and ${s[2]} units long. Count the unit squares inside: what is the area of the ${which} one?`,
        setup, answer: { board: shapeCheck(s.map(x => ({ square: true, area: x * x })), `Make three closed squares, with sides ${s.join(', ')} units long.`), box: { key: String(a), label: 'square units' } },
        hints: [`${cornerHint} Pegs next to each other are 1 unit apart.`, `The ${which} square has sides ${s[ask]} long: ${plural(s[ask], 'row')} of ${plural(s[ask], 'unit square')}.`, `${s[ask]} × ${s[ask]} = ${a}.`],
        explain: `A square with sides ${s[ask]} long holds ${plural(s[ask], 'row')} of ${plural(s[ask], 'unit square')}: ${plural(a, 'square unit')}. Doubling the side makes the area 4 times as big.`,
        solution: { board: solved(setup, [rectPts(0, 0, s[0], s[0]), rectPts(5 - s[1], 5 - s[1], s[1], s[1]), rectPts(0, 5 - s[2], s[2], s[2])]), box: String(a) },
      };
    }),
  T('right-angle-hunt', 'Right angle hunt', '4.G.A.1', '4',
    'Make a triangle with a right angle (its two short sides given), then a triangle with no right angle of the kind asked for. Type the right triangle\'s area.',
    'Check against the corner of a book or the board\'s own grid corner. Peg geometry makes angle a thing you can test.',
    R => {
      const a = R.int(1, 5), b = R.int(a, 5), kind = R.pick(['obtuse', 'acute']), setup = geoBoard(ONE), area = (a * b) / 2;
      const other = kind === 'obtuse' ? [[0, 5], [1, 4], [4, 5]] : [[0, 5], [4, 5], [2, 2]];
      return {
        prompt: `Make a triangle with a right angle whose two sides along the grid are ${a === b ? `both ${plural(a, 'unit')}` : `${a} and ${plural(b, 'unit')}`} long. Then make a triangle with no right angle, with one angle ${kind === 'obtuse' ? 'bigger than' : 'and every angle smaller than'} a right angle. What is the area of the right triangle?`,
        setup, answer: { board: shapeCheck([{ sides: 3, right: true, legs: [a, b] }, { sides: 3, right: false, [kind]: true }], `Make a right triangle with sides ${a} and ${b}, and a triangle with no right angle (${kind === 'obtuse' ? 'one wide angle' : 'all angles narrow'}).`), box: { key: fmtA(area), label: 'square units' } },
        hints: ['A right angle is a square corner, like the corner of the board. Go along one grid line, then turn onto the other.', `The right triangle is half of a ${a} by ${b} rectangle.`, `${a} × ${b} = ${a * b}, and half of that is ${fmtA(area)}.`],
        explain: `The right triangle is half of a ${a} by ${b} rectangle: ${a * b} ÷ 2 = ${fmtA(area)} square ${area === 1 ? 'unit' : 'units'}. The grid lines meet at right angles, so a corner along them is always a right angle.`,
        solution: { board: solved(setup, [[[0, 0], [a, 0], [0, b]], other]), box: fmtA(area) },
      };
    }),
  T('same-area-different-shape', 'Same area, different shape', '3.MD.C.7d', '3',
    'Make two different shapes of the kinds asked for that both have the area given. Count whole and half squares to check.',
    'Triangles count as halves. This is conservation of area: shape changes, area does not have to.',
    R => {
      const mk = { rect: A => { const o = []; for (let w = 1; w <= 5; w++) for (let h = 1; h <= 5; h++) if (w * h === A) o.push(rectPts(0, 0, w, h)); return o; },
        tri: A => { const o = []; for (let w = 1; w <= 5; w++) for (let h = 1; h <= 5; h++) if (w * h === 2 * A) { o.push([[0, 0], [w, 0], [0, h]]); if (w < 5) o.push([[0, h], [w, h], [w + 1, 0]].map(([x, y]) => [x, y])); } return o; },
        six: A => { const o = []; for (let w = 2; w <= 5; w++) for (let h = 2; h <= 5; h++) for (let cw = 1; cw < w; cw++) for (let ch = 1; ch < h; ch++) if (w * h - cw * ch === A) o.push([[0, 0], [w, 0], [w, h - ch], [w - cw, h - ch], [w - cw, h], [0, h]]); return o; } };
      const NAMES = { rect: 'a rectangle', tri: 'a triangle', six: 'a shape with 6 sides' }, SIDES = { rect: 4, tri: 3, six: 6 };
      const items = [];
      for (const [p, q] of [['rect', 'tri'], ['rect', 'six'], ['tri', 'six'], ['six', 'six'], ['tri', 'tri'], ['rect', 'rect']]) for (let A = 2; A <= 12; A++) {
        const a = mk[p](A), b = mk[q](A), sh = x => shapeOf({ pts: x.map(([u, v]) => ({ x: u, y: v })) });
        const pair = a.flatMap(x => b.map(y => [x, y])).find(([x, y]) => sh(x).sig !== sh(y).sig);
        if (pair) items.push({ p, q, A, pair });
      }
      const it = R.pick(items), setup = geoBoard(ONE), both = it.p === it.q;
      return {
        prompt: `Make two different shapes that both have an area of ${it.A} square units: ${both ? `two different ${it.p === 'rect' ? 'rectangles' : it.p === 'tri' ? 'triangles' : 'shapes with 6 sides'}` : `${NAMES[it.p]} and ${NAMES[it.q]}`}. Count whole and half squares to check.`,
        setup, answer: { board: shapeCheck([{ sides: SIDES[it.p], area: it.A, ...(it.p === 'rect' ? { rectAny: true } : {}) }, { sides: SIDES[it.q], area: it.A, ...(it.q === 'rect' ? { rectAny: true } : {}) }], `Make two different closed shapes, each with area ${it.A}.`, { different: true }) },
        hints: [`${cornerHint} ${it.p === 'tri' || it.q === 'tri' ? 'A triangle often covers half squares: two halves make one whole.' : 'Count the unit squares inside each shape.'}`, it.p === 'rect' || it.q === 'rect' ? `A rectangle with area ${it.A}: which two numbers multiply to ${it.A}?` : it.p === 'tri' || it.q === 'tri' ? `A right triangle is half of a rectangle. Half of what makes ${it.A}?` : `A shape with 6 sides can be a rectangle with a corner cut off: count the squares that are left.`, `For example: ${[it.pair[0], it.pair[1]].map(x => x.map(xy).join(' ')).join(', and ')} (corners, (0, 0) at the bottom left).`],
        explain: `Both shapes cover ${it.A} unit squares (two half squares count as one), so they have the same area even though they are different shapes.`,
        solution: { board: solved(setup, [it.pair[0], shift(it.pair[1], 0, 0)]) },
      };
    }),
  T('perimeter-puzzle', 'Perimeter puzzle', '4.MD.A.3', '4',
    'Make a shape with its sides along the grid lines, the area given and a long perimeter (the biggest you can, or longer than a partner\'s rectangle).',
    'Long thin shapes win. Children discover perimeter and area are independent measures, a classic misconception target.',
    R => {
      const setup = geoBoard(ONE), fam = R.pick(['big', 'big', 'beat']), noun = R.pick(['shape', 'garden', 'flower bed']);
      if (fam === 'big') {
        const A = R.int(3, 12), p = 2 * A + 2, sh = polyomino(R, A, (c, per) => per === p, { tree: true }) || polyomino(R, A, (c, per) => per === p);
        return {
          prompt: `Make a ${noun} with an area of ${A} square units, its sides along the grid lines, and the biggest perimeter you can. What is its perimeter?`,
          setup, answer: { board: shapeCheck([{ axis: true, area: A, perim: p }], `Make a closed shape of ${A} unit squares, long and thin, with sides along the grid lines.`), box: { key: String(p), label: 'units' } },
          hints: ['Long and thin beats short and wide: every square should touch as few others as it can.', `Squares in a line each touch just one or two others. Count all the outside edges.`, `With ${A} squares the biggest perimeter is ${A} × 2 + 2 = ${p}.`],
          explain: `${A} squares joined in a long thin chain have ${p} outside edges. A compact shape with the same area has a much smaller perimeter: area and perimeter are different measures.`,
          solution: { board: solved(setup, [sh.pts]), box: String(p) },
        };
      }
      const [w, h] = R.pick([[2, 2], [2, 3], [2, 4], [2, 5], [3, 3], [3, 4]]), A = w * h, q = 2 * (w + h), sh = polyomino(R, A, (c, per) => per > q, { tree: R.chance() });
      return {
        prompt: `A partner made a ${w} by ${h} rectangle: area ${A}, perimeter ${q}. Make a different ${noun} with the same area, sides along the grid lines, and a bigger perimeter. What is its perimeter?`, sig: `${w}x${h} ${noun}`,
        setup, answer: { board: shapeCheck([{ axis: true, area: A, perimMin: q }], `Make a closed shape of ${A} unit squares with a perimeter bigger than ${q}.`), box: { keys: Array.from({ length: A + 1 }, (_, i) => String(q + 2 * (i + 1))).filter(k => +k <= 2 * A + 2), key: String(sh.perim), label: 'units', say: 'Count every outside edge of your shape.' } },
        hints: ['Stretch the rectangle out: move squares so they stick out on their own.', 'Each square that sticks out adds outside edges. Count the edges all the way around.', `For example, a shape with perimeter ${sh.perim}: ${sh.pts.map(xy).join(' ')} ((0, 0) at the bottom left).`],
        explain: `The same ${A} squares spread out have more outside edges than the ${w} by ${h} rectangle (perimeter ${q}). Same area, different perimeter.`,
        solution: { board: solved(setup, [sh.pts]), box: String(sh.perim) },
      };
    }),
  T('triangles-of-area-1', 'Triangles of a given area', '3.MD.C.6', '3',
    'Make two different triangles with the area given (or one with a right angle and one without). Count whole and half squares to check.',
    'Right triangles covering half of a 2 by 1 rectangle work. Half-unit counting must be explicit.',
    R => {
      const items = [];
      for (const A of [1, 1.5, 2, 2.5, 3, 4, 4.5, 5, 6, 7.5, 8, 10]) for (const fam of ['two', 'mix', 'rights']) {
        const tris = [];
        for (let w = 1; w <= 5; w++) for (let h = 1; h <= 5; h++) if (w * h === 2 * A) { tris.push([[0, 5], [w, 5], [0, 5 - h]]); for (let x = 1; x <= 5; x++) if (x !== w) tris.push([[0, 5], [w, 5], [x, 5 - h]]); }
        const info = tris.map(t => ({ t, s: shapeOf({ pts: t.map(([u, v]) => ({ x: u, y: v })) }) })).filter(o => o.s && near(o.s.area, A));
        const isR = o => fits(o.s, { right: true });
        let pair = null;
        for (const x of info) for (const y of info) if (!pair && x.s.sig !== y.s.sig && (fam === 'two' || (fam === 'mix' ? isR(x) && !isR(y) : isR(x) && isR(y)))) pair = [x.t, y.t];
        if (pair) items.push({ A, fam, pair });
      }
      const it = R.pick(items), setup = geoBoard(ONE), A = it.A;
      const want = it.fam === 'two' ? [{ sides: 3, area: A }, { sides: 3, area: A }] : it.fam === 'mix' ? [{ sides: 3, area: A, right: true }, { sides: 3, area: A, right: false }] : [{ sides: 3, area: A, right: true }, { sides: 3, area: A, right: true }];
      const what = it.fam === 'two' ? 'two different triangles' : it.fam === 'mix' ? 'one triangle with a right angle and one with no right angle' : 'two different triangles, each with a right angle';
      return {
        prompt: `Make ${what}, each with an area of exactly ${fmtA(A)} square unit${A === 1 ? '' : 's'}. Count whole and half squares to check.`,
        setup, answer: { board: shapeCheck(want, `Make ${what}, each with area ${fmtA(A)}.`, { different: true }) },
        hints: [`${cornerHint} A triangle is half of a rectangle around it.`, `Find a rectangle with area ${fmtA(2 * A)}: half of it is ${fmtA(A)}. Its diagonal cuts it into two triangles.`, `For example: ${it.pair.map(t => t.map(xy).join(' ')).join(', and ')} ((0, 0) at the bottom left).`],
        explain: `Each triangle is half of a rectangle with area ${fmtA(2 * A)}, so each has area ${fmtA(A)}. Moving the top corner along its row keeps the base and the height, so the area stays the same.`,
        solution: { board: solved(setup, it.pair) },
      };
    }),
  T('isosceles-hunt', 'Isosceles hunt', '4.G.A.2', '4',
    'Make an isosceles triangle of the size asked for, then answer a question about equal sides on the peg grid.',
    'True equilateral triangles cannot be made on a square peg grid, a famous and discussable limitation.',
    R => {
      const items = [];
      for (const b of [2, 4]) for (let h = 1; h <= 5; h++) for (const q of ['equi', 'which']) items.push({ b, h, q });
      for (let a = 1; a <= 5; a++) for (const q of ['equi', 'which']) items.push({ a, q });
      const it = R.pick(items), setup = geoBoard(ONE);
      const spec = it.a ? { sides: 3, iso: true, right: true, legs: [it.a, it.a] } : { sides: 3, base: it.b, area: (it.b * it.h) / 2 };
      const make = it.a ? `an isosceles triangle with a right angle and two sides ${plural(it.a, 'unit')} long` : `an isosceles triangle with a base ${it.b} units long and a height of ${it.h}`;
      const sol = it.a ? [[0, 5], [it.a, 5], [0, 5 - it.a]] : [[0, 5], [it.b, 5], [it.b / 2, 5 - it.h]];
      const choice = it.q === 'equi' ? { options: ['Yes', 'No'], correct: 1, say: 'Try to make all three sides the same length. Do the pegs ever line up?' }
        : { ...shuffled(R, [it.a ? 'The two sides at the right angle' : 'The two slanted sides', it.a ? 'The longest side and one short side' : 'The base and one slanted side', 'All three sides'], it.a ? 'The two sides at the right angle' : 'The two slanted sides'), say: 'Compare how far each side goes across and up.' };
      return {
        prompt: `Make ${make}. ${it.q === 'equi' ? 'Then try to make all three sides equal. Can you make a triangle with all three sides equal on this board?' : 'Which sides of your triangle are the same length?'}`,
        setup, answer: { board: shapeCheck([spec], `Make ${make}.`), choice },
        hints: [it.a ? 'Go along a grid line, turn a square corner, and go the same distance.' : `Put the base along a row. Its middle is ${it.b / 2} from each end: put the top peg above the middle, ${it.h} row${it.h > 1 ? 's' : ''} up.`, it.q === 'equi' ? 'The pegs are on a square grid. An equal-sided triangle needs a top corner between the pegs.' : 'Sides that go the same number of pegs across and up (in either direction) are the same length.', it.q === 'equi' ? 'No: on a square grid one corner always misses a peg.' : `${choice.options[choice.correct]}.`],
        explain: it.q === 'equi' ? 'An isosceles triangle has two equal sides. All three equal needs a corner that falls between the pegs, so a square peg grid cannot make one.' : 'The equal sides of an isosceles triangle step the same number of pegs across and up, mirror images of each other.',
        solution: { board: solved(setup, [sol]), choice: choice.correct },
      };
    }),
  T('parallel-bands', 'Parallel bands', '4.G.A.1', '4',
    'Make a parallelogram (two pairs of parallel sides) or a trapezoid (one pair) as described, and pick how the pegs show parallel.',
    'Parallel bands step across and up by the same pattern. Slope language can be introduced informally here.',
    R => {
      const setup = geoBoard(ONE), right = 'They step across and up by the same amounts';
      const choice = { ...shuffled(R, [right, 'They are the same length', 'They meet at a peg'], right), say: 'Parallel sides never meet. Look at how each side steps from peg to peg.' };
      if (R.chance()) {
        const a = R.int(1, 3), b = R.int(1, 4), w = R.int(1, 5 - a);
        return {
          prompt: `Make a parallelogram: a top and bottom side ${w} unit${w > 1 ? 's' : ''} long, and slanted sides that each step ${a} across for every ${b} up. How do the pegs show that two sides are parallel?`,
          setup, answer: { board: shapeCheck([{ sides: 4, pairs: 2, step: [a, b], lens: [w, w] }], `Make a parallelogram with sides ${w} long and slanted sides stepping ${a} across and ${b} up.`), choice },
          hints: [`Start with the bottom side: ${plural(w, 'peg')} along a row.`, `From each end, go ${a} across and ${b} up the same way. Join the tops.`, 'Both slanted sides step the same way, so they never meet: they are parallel.'],
          explain: `Sides that step the same amount across and up (${a} across, ${b} up) point the same way, so they never meet. A parallelogram has two pairs of them.`,
          solution: { board: solved(setup, [[[0, 5], [w, 5], [w + a, 5 - b], [a, 5 - b]]]), choice: choice.correct },
        };
      }
      const L1 = R.int(1, 4), L2 = R.int(L1 + 1, 5), h = R.int(1, 5);
      return {
        prompt: `Make a trapezoid with exactly one pair of parallel sides, ${L1} and ${L2} units long, ${h} unit${h > 1 ? 's' : ''} apart. How do the pegs show that two sides are parallel?`,
        setup, answer: { board: shapeCheck([{ sides: 4, pairs: 1, lens: [L1, L2] }], `Make a 4-sided shape with one pair of parallel sides, ${L1} and ${L2} long.`), choice },
        hints: [`Put the side ${L2} long along a row.`, `Put the side ${L1} long along another row, ${h} up. Rows never meet, so they are parallel.`, 'Join the ends: the two slanted sides are not parallel.'],
        explain: `Two sides along rows of pegs step the same way (across, and 0 up), so they are parallel. A trapezoid has just one pair like that.`,
        solution: { board: solved(setup, [[[0, 5], [L2, 5], [L1, 5 - h], [0, 5 - h]]]), choice: choice.correct },
      };
    }),
  T('area-by-splitting', 'Area by splitting', '6.G.A.1', '6',
    'The Shape board shows a polygon. Copy it on your board, split it into rectangles and triangles with extra bands, and add the parts for its area.',
    'Splitting is the general area strategy. Any split that covers without overlap is valid, so compare methods.',
    R => {
      let P;
      do {
        const top = R.int(0, 1), bot = R.int(4, 5), mid = R.int(top + 1, bot - 1), l = R.int(0, 1), r = R.int(4, 5);
        P = [[l, mid], [l + R.int(1, 2), top], [r - R.int(1, 2), top], [r, mid], [r - R.int(0, 2), bot], [l + R.int(0, 2), bot]];
      } while (!(P[1][0] < P[2][0] && P[5][0] <= P[4][0] && (shapeOf({ pts: P.map(([x, y]) => ({ x, y })) }) || {}).n));
      const s = shapeOf({ pts: P.map(([x, y]) => ({ x, y })) }), area = s.area, setup = geoBoard([{ label: 'Shape', bands: [P], q: true }, { label: 'Your board' }]);
      return {
        prompt: `Find the area of the shape on the Shape board. Copy it on your board, split it into rectangles and triangles with extra bands, and add up the parts.`, sig: JSON.stringify(P),
        setup, answer: { box: { key: fmtA(area), label: 'square units', say: 'Add the rectangle in the middle and the triangles at the sides.' } },
        hints: ['Find the biggest rectangle inside the shape whose sides are on the grid lines.', 'The pieces left over are right triangles: each is half of a rectangle.', `The parts add up to ${fmtA(area)}.`],
        explain: `Splitting gives a rectangle and right triangles (each half a rectangle). Their areas add up to ${fmtA(area)} square units.`,
        solution: { board: setup, box: fmtA(area) },
      };
    }),
  T('smallest-perimeter', 'Smallest perimeter', '4.MD.A.3', '4',
    'Make a shape with the area given, sides along the grid lines, and the smallest perimeter you can. Type its perimeter.',
    'Compact shapes win again: a 3 by 1 strip has perimeter 8, an L shape can match or differ, prompting careful counting.',
    R => {
      const A = R.int(2, 20), noun = R.pick(['garden', 'pen for a pet', 'play mat']), p = 2 * Math.ceil(2 * Math.sqrt(A) - 1e-9), sh = compact(A), setup = geoBoard(ONE);
      return {
        prompt: `A ${noun} needs an area of ${A} square units. Make it with sides along the grid lines and the smallest perimeter you can, so it needs the least fence. What is its perimeter?`,
        setup, answer: { board: shapeCheck([{ axis: true, area: A, perim: p }], `Make a closed shape of ${A} unit squares, as close to a square as you can.`), box: { key: String(p), label: 'units' } },
        hints: ['Close to a square is best: long thin shapes need more fence.', `Try rows of ${Math.ceil(Math.sqrt(A))}: ${Math.floor(A / Math.ceil(Math.sqrt(A)))} full row${Math.floor(A / Math.ceil(Math.sqrt(A))) > 1 ? 's' : ''}${A % Math.ceil(Math.sqrt(A)) ? ` and ${A % Math.ceil(Math.sqrt(A))} more` : ''}.`, `That shape has a perimeter of ${p}.`],
        explain: `A shape close to a square keeps the most squares inside for the least edge: ${A} square units fit inside a perimeter of ${p}.`,
        solution: { board: solved(setup, [sh.pts]), box: String(p) },
      };
    }),
  T('angle-sizes', 'Angle sizes', '4.MD.C.6', '4',
    'Make a triangle or a 4-sided shape in the color asked for, with a 45, 90 or 135 degree angle. Then find what its other angles add up to.',
    'Diagonals give 45 degrees on a square grid. Checking with a corner and a diagonal fold makes the estimates honest.',
    R => {
      const kind = R.pick(['tri', 'quad']), ang = R.pick([45, 90, 135]), [cname, col] = R.pick(Object.entries(COLORS)), setup = geoBoard(ONE);
      const SOL = { tri45: [[0, 5], [3, 5], [0, 2]], tri90: [[0, 5], [2, 5], [0, 2]], tri135: [[0, 4], [1, 3], [3, 3]], quad45: [[0, 5], [2, 5], [3, 4], [1, 4]], quad90: rectPts(0, 3, 3, 2), quad135: [[0, 5], [2, 5], [3, 4], [1, 4]] };
      const total = kind === 'tri' ? 180 : 360, rest = total - ang, sides = kind === 'tri' ? 3 : 4;
      return {
        prompt: `Pick the ${cname.toLowerCase()} band and make a ${kind === 'tri' ? 'triangle' : '4-sided shape'} with a ${ang} degree angle. What do its other angles add up to?`,
        setup, answer: { board: shapeCheck([{ sides, angle: ang, color: col }], `Make a ${cname.toLowerCase()} ${kind === 'tri' ? 'triangle' : '4-sided shape'} with a ${ang} degree angle.`), box: { key: String(rest), label: 'degrees', say: `The angles of a ${kind === 'tri' ? 'triangle' : '4-sided shape'} add up to ${total} degrees.` } },
        hints: [`A grid corner is 90 degrees. A diagonal across a square cuts it in half: 45. A right angle and a 45 make 135.`, `Pick ${cname} in the palette first, then tap the corners and Close the band.`, `The angles of a ${kind === 'tri' ? 'triangle' : '4-sided shape'} add up to ${total}: ${total} - ${ang} = ${rest}.`],
        explain: `${ang} + ${rest} = ${total}. Every ${kind === 'tri' ? 'triangle\'s angles add up to 180' : '4-sided shape\'s angles add up to 360'} degrees.`,
        solution: { board: solved(setup, [{ pts: SOL[kind + ang], color: col }]), box: String(rest) },
      };
    }),
  T('mirror-shape', 'Mirror shape', '4.G.A.3', '4',
    'A band shape is on one half of the board. Make its mirror image on the other half, and pick the rule your hands followed.',
    'Each peg maps to the peg the same distance on the other side of the middle line. Distance language is the key.',
    R => {
      const lr = R.chance();
      let P, s;
      do {
        const n = R.int(3, 5), pts = [];
        while (pts.length < n) { const p = [R.int(0, 2), R.int(0, 5)]; if (!pts.some(q => q[0] === p[0] && q[1] === p[1])) pts.push(p); }
        const cx = pts.reduce((t, p) => t + p[0], 0) / n, cy = pts.reduce((t, p) => t + p[1], 0) / n;
        P = pts.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
        if (!lr) P = P.map(([x, y]) => [y, x]);
        s = shapeOf({ pts: P.map(([x, y]) => ({ x, y })) });
      } while (!s || s.n !== P.length);
      const M = P.map(([x, y]) => (lr ? [5 - x, y] : [x, 5 - y])), setup = geoBoard([{ bands: [P] }]);
      const right = 'Each peg goes the same distance on the other side of the middle line';
      const choice = { ...shuffled(R, [right, 'Each peg moves 3 pegs the same way', 'Each peg stays where it is'], right), say: 'Think about how far each peg is from the middle line.' };
      return {
        prompt: `The red band is a shape on the ${lr ? 'left' : 'top'} half. Make its mirror image on the ${lr ? 'right' : 'bottom'} half, with the middle line between the 3rd and 4th ${lr ? 'columns' : 'rows'} of pegs. What rule did your hands follow?`, sig: `${lr} ${JSON.stringify(P)}`,
        setup, answer: { board: shapeCheck([{ verts: P.map(([x, y]) => [x, y]) }, { verts: M }], `Keep the red shape, and make its mirror image on the ${lr ? 'right' : 'bottom'} half.`), choice },
        hints: [`Pick one corner. Count how many pegs it is from the middle line.`, `Its mirror peg is the same number of pegs from the middle line on the other side, in the same ${lr ? 'row' : 'column'}.`, `The mirror corners are ${M.map(xy).join(', ')} ((0, 0) at the bottom left).`],
        explain: 'In a mirror image every corner is the same distance from the middle line, on the other side. The shape flips but keeps its size.',
        solution: { board: solved(setup, [M]), choice: choice.correct },
      };
    }),
  T('pentomino-try', 'Pentomino try', '3.MD.C.6', '3',
    'The Look board shows a pentomino (5 squares joined edge to edge). Copy it on your board, then make a different pentomino.',
    'There are 12 free pentominoes. Hunting them on a geoboard is rich spatial work with a clear area check.',
    R => {
      const PENT = { F: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]], I: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], L: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]], N: [[1, 0], [1, 1], [0, 2], [1, 2], [0, 3]], P: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]], T: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]],
        U: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]], V: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], W: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]], X: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], Y: [[1, 0], [0, 1], [1, 1], [1, 2], [1, 3]], Z: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]] };
      const name = R.pick(Object.keys(PENT)), k = R.int(0, 7);
      const cells = PENT[name].map(([x, y]) => { let a = k & 1 ? [y, x] : [x, y]; if (k & 2) a = [-a[0], a[1]]; if (k & 4) a = [a[0], -a[1]]; return a; });
      const mx = Math.min(...cells.map(a => a[0])), my = Math.min(...cells.map(a => a[1])), norm = cells.map(([x, y]) => [x - mx, y - my]);
      const other = R.pick(Object.keys(PENT).filter(n => n !== name && n !== 'I' && n !== 'X'));
      const look = outlineOf(norm), canon = canonCells(norm), mine = outlineOf(PENT[other]);
      const w = Math.max(...norm.map(a => a[0])) + 1, h = Math.max(...norm.map(a => a[1])) + 1;
      const setup = geoBoard([{ label: 'Look', bands: [shift(look, Math.floor((5 - w) / 2), Math.floor((5 - h) / 2))], q: true }, { label: 'Your board' }]);
      const ow = Math.max(...PENT[other].map(a => a[0])) + 1, oh = Math.max(...PENT[other].map(a => a[1])) + 1;
      return {
        prompt: `The Look board shows the ${name} pentomino: 5 unit squares joined edge to edge. Copy it on your board. Then make a different pentomino next to it.`, sig: `${name}${k}`,
        setup, answer: { board: shapeCheck([{ cells: canon, area: 5 }, { axis: true, area: 5, notCells: canon }], `Copy the ${name} pentomino, and make a different shape of 5 unit squares.`) },
        hints: ['Count the squares on the Look board row by row, then tap the corners of its outline on your board.', 'A pentomino is any 5 squares joined by whole edges: a line, an L, a T...', `The ${name} turned or flipped is still the ${name}. Try a different letter, like the ${other}.`],
        explain: `Both shapes have an area of 5 square units. There are 12 different pentominoes; turning or flipping one does not make a new one.`,
        solution: { board: solved(setup, [look, shift(mine, 5 - ow, 5 - oh)]) },
      };
    }),
  T('circle-board-fractions', 'Circle board fractions', '4.MD.C.5', '4',
    'On the circular board, join the center to rim pegs to show a fraction of a full turn. Find its degrees, its fraction or its pegs.',
    'Twelve pegs divide the turn into twelfths, so quarters are 3 pegs, thirds 4, sixths 2. Fractions of a turn become visible.',
    R => {
      const k = R.int(1, 11), q = R.pick(['deg', 'frac', 'pegs']), gg = (x, y) => (y ? gg(y, x % y) : x), c = gg(k, 12);
      const f = `${k / c}/${12 / c}`, d = 30 * k, setup = geoBoard([{ board: 'circle' }]);
      const C = circlePegs(), fan = [12, ...Array.from({ length: k + 1 }, (_, i) => (9 + i) % 12)].map(i => [C[i].x, C[i].y]);
      const say = `Make a band from the center peg out to the rim, around ${k} space${k > 1 ? 's' : ''} between rim pegs, and back to the center.`;
      const board = shapeCheck([{ center: d }], say);
      const base = { deg: `Join the center to the rim pegs to show ${f} of a full turn. How many degrees is that?`, frac: `Join the center to the rim pegs to make an angle of ${d} degrees at the center. What fraction of a full turn is it?`, pegs: `Show ${f} of a full turn from the center. How many spaces between rim pegs does it go around?` }[q];
      const box = { deg: { key: String(d), label: 'degrees' }, frac: { key: f, label: 'fraction of a turn' }, pegs: { key: String(k), label: 'spaces between pegs' } }[q];
      return {
        prompt: `${base}`, setup, answer: { board, box },
        hints: ['The 12 rim pegs split a full turn into 12 equal parts, each 30 degrees.', q === 'frac' ? `${d} ÷ 30 = ${plural(k, 'part')} out of 12.` : `${f} of 12 parts is ${k} part${k > 1 ? 's' : ''}.`, { deg: `${k} × 30 = ${d}.`, frac: `${k}/12 = ${f}.`, pegs: `It goes around ${k} space${k > 1 ? 's' : ''}.` }[q] + (k > 6 ? ' Go around through each rim peg, then back to the center.' : '')],
        explain: `${k} of the 12 equal parts of the turn: ${k}/12 = ${f} of a turn, and ${k} × 30 = ${d} degrees.`,
        solution: { board: solved(setup, [fan]), box: box.key },
      };
    }),
  T('rectangle-ratios', 'Rectangle ratios', '7.G.A.1', '7',
    'Make a rectangle and a scaled copy of it (the board fits sides up to 5). Compare their areas or perimeters.',
    'Same shape, scaled: area grows from 6 to 24, four times, because both sides doubled. A key ratio insight.',
    R => {
      const pairs = [];
      for (const [a, b] of [[1, 1], [1, 2], [2, 2], [3, 3], [4, 4], [2, 1]]) for (const [n, m] of [[2, 1], [3, 1], [4, 1], [5, 1], [3, 2], [5, 2], [4, 3], [5, 3], [5, 4]]) {
        const A = (a * n) / m, B = (b * n) / m;
        if (Number.isInteger(A) && Number.isInteger(B) && A <= 5 && B <= 5) pairs.push({ a, b, A, B, k: [n, m] });
      }
      const it = R.pick(pairs), q = R.pick(['area', 'times', 'perim']), setup = geoBoard(ONE), k = it.k[1] === 1 ? String(it.k[0]) : `${it.k[0]}/${it.k[1]}`;
      const g = (x, y) => (y ? g(y, x % y) : x), sq = [it.k[0] ** 2, it.k[1] ** 2], gg = g(sq[0], sq[1]), k2 = sq[1] / gg === 1 ? String(sq[0] / gg) : `${sq[0] / gg}/${sq[1] / gg}`;
      const ask = { area: `What is the area of the bigger rectangle?`, times: 'How many times as big is the bigger area?', perim: 'How many times as long is the bigger perimeter?' }[q];
      const key = { area: String(it.A * it.B), times: k2, perim: k }[q];
      return {
        prompt: `Make a ${it.a} by ${it.b} rectangle and a ${it.A} by ${it.B} rectangle. Each side was multiplied by ${k}. ${ask}`,
        setup, answer: { board: shapeCheck([{ rect: [it.a, it.b] }, { rect: [it.A, it.B] }], `Make a ${it.a} by ${it.b} rectangle and a ${it.A} by ${it.B} rectangle.`), box: { key, label: q === 'area' ? 'square units' : 'times' } },
        hints: [`${cornerHint} Make both rectangles on the board.`, `Areas: ${it.a} × ${it.b} = ${it.a * it.b} and ${it.A} × ${it.B} = ${it.A * it.B}. Perimeters: ${2 * (it.a + it.b)} and ${2 * (it.A + it.B)}.`, { area: `${it.A} × ${it.B} = ${it.A * it.B}.`, times: `${it.A * it.B} ÷ ${it.a * it.b} = ${k2}: the scale ${k} times itself.`, perim: `${2 * (it.A + it.B)} ÷ ${2 * (it.a + it.b)} = ${k}, the same as the scale.` }[q]],
        explain: `When every side is multiplied by ${k}, the perimeter is ${k} times as long and the area is ${k} × ${k} = ${k2} times as big.`,
        solution: { board: solved(setup, [rectPts(0, 0, it.a, it.b), rectPts(5 - it.A, 5 - it.B, it.A, it.B)]), box: key },
      };
    }),
  T('pick-a-perimeter', 'Pick a perimeter', '4.MD.A.3', '4',
    'Make shapes with sides along the grid lines and an exact perimeter: one with the area given, or two where the second encloses more.',
    'Many shapes share perimeter 12; the 3 by 3 square encloses the most area at 9. Comparing areas settles arguments.',
    R => {
      const setup = geoBoard(ONE);
      if (R.chance(0.4)) {
        const P = R.pick([8, 10, 12, 14, 16, 18, 20]), s = P / 2, best = Math.floor(s / 2) * Math.ceil(s / 2);
        const big = rectPts(0, 0, Math.floor(s / 2), Math.ceil(s / 2));
        let small = null;
        for (let n = 2; !small && n < best; n++) small = polyomino(R, n, (c, per) => per === P, { tries: 60 });
        return {
          prompt: `Make a shape with a perimeter of exactly ${P} units, sides along the grid lines. Then make a different shape with the same perimeter and a bigger area. What is the biggest area a shape with perimeter ${P} can have?`,
          setup, answer: { board: shapeCheck([{ axis: true, perim: P }, { axis: true, perim: P }], `Make two closed shapes with perimeter ${P}, the second with more squares inside.`, { grow: true }), box: { key: String(best), label: 'square units' } },
          hints: [`A long thin shape like ${small.pts.map(xy).join(' ')} has perimeter ${P}. Count its edges all the way around.`, 'With the same perimeter, the closer to a square, the more squares fit inside.', `A ${Math.floor(s / 2)} by ${Math.ceil(s / 2)} rectangle has perimeter ${P} and area ${best}.`],
          explain: `Shapes with perimeter ${P} can hold different areas. The ${Math.floor(s / 2)} by ${Math.ceil(s / 2)} rectangle, closest to a square, holds the most: ${best}.`,
          solution: { board: solved(setup, [small.pts, big]), box: String(best) },
        };
      }
      const sh = polyomino(R, R.int(3, 9), () => true, { tree: R.chance(0.4) });
      const A = sh.cells.length;
      return {
        prompt: `Make a shape with sides along the grid lines, a perimeter of exactly ${sh.perim} units and an area of ${A} square units.`,
        setup, answer: { board: shapeCheck([{ axis: true, perim: sh.perim, area: A }], `Make a closed shape with perimeter ${sh.perim} and area ${A}.`) },
        hints: [`Start with ${A} unit squares in a shape, then count the outside edges.`, `Too short? Stretch it out. Too long? Make it more like a square.`, `For example: ${sh.pts.map(xy).join(' ')} ((0, 0) at the bottom left).`],
        explain: `Perimeter counts the edges around the outside; area counts the squares inside. The same area can have different perimeters.`,
        solution: { board: solved(setup, [sh.pts]) },
      };
    }),
  T('coordinates-on-pegs', 'Coordinates on pegs', '5.G.A.1', '5',
    'The bottom-left peg is (0, 0). Make the shape whose corners are given as coordinates, or read a corner of a shape as coordinates.',
    'Rebuilding from coordinates alone tests precision. This bridges geoboard work to the coordinate board.',
    R => {
      let P, s;
      do {
        const n = R.int(3, 4), pts = [];
        while (pts.length < n) { const p = [R.int(0, 5), R.int(0, 5)]; if (!pts.some(q => q[0] === p[0] && q[1] === p[1])) pts.push(p); }
        const cx = pts.reduce((t, p) => t + p[0], 0) / n, cy = pts.reduce((t, p) => t + p[1], 0) / n;
        P = pts.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
        s = shapeOf({ pts: P.map(([x, y]) => ({ x, y })) });
      } while (!s || s.n !== P.length);
      if (R.chance()) {
        return {
          prompt: `The bottom-left peg is (0, 0). Make the shape with corners at ${P.map(xy).join(', ')}.`,
          setup: geoBoard(ONE), answer: { board: shapeCheck([{ verts: P }], `Make a closed shape with corners at exactly ${P.map(xy).join(', ')}.`) },
          hints: ['The first number says how many pegs to go across from (0, 0); the second says how many up.', `${xy(P[0])}: ${P[0][0]} across, ${5 - P[0][1]} up. Tap that peg.`, `${cornerHint}`],
          explain: 'Each corner is an ordered pair: across first, then up. Two numbers are enough to find any peg.',
          solution: { board: solved(geoBoard(ONE), [P]) },
        };
      }
      const ys = P.map(p => p[1]), top = Math.min(...ys), tops = P.filter(p => p[1] === top);
      const xs = P.map(p => p[0]), rt = Math.max(...xs), rts = P.filter(p => p[0] === rt);
      const pick = tops.length === 1 ? { p: tops[0], w: 'highest' } : rts.length === 1 ? { p: rts[0], w: 'farthest right' } : { p: P.find(p => p[1] === Math.max(...ys)), w: 'lowest' };
      const key = `(${pick.p[0]},${5 - pick.p[1]})`, setup = geoBoard([{ label: 'Shape', bands: [P], q: true }]);
      return {
        prompt: `The bottom-left peg is (0, 0). What are the coordinates of the ${pick.w} corner of the shape?`, sig: `${JSON.stringify(P)} ${pick.w}`,
        setup, answer: { box: { key, kind: 'point', label: 'coordinates, like (2, 3)', say: 'Count across from (0, 0) first, then up.' } },
        hints: [`Find the ${pick.w} corner.`, 'Count the pegs across from the left edge, then the pegs up from the bottom row.', `It is ${pick.p[0]} across and ${5 - pick.p[1]} up: ${xy(pick.p)}.`],
        explain: `The corner is ${plural(pick.p[0], 'peg')} across and ${plural(5 - pick.p[1], 'peg')} up from (0, 0), so it is ${xy(pick.p)}.`,
        solution: { box: key },
      };
    }),
];
