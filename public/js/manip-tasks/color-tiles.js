// Color Tiles: the tool's 17 tasks as practice (docs/manip-practice-tasks.md). As in rekenreks.js: each task keeps its
// title, code, grade and notes; make(R) gives one variation; conds are this tool's board checks, read from the board's
// tiles (piece-grid.js): rectangles and shapes on a lattice (rows and columns, any turn), colors by place (a border, a
// split, a symmetric quilt), a pattern row, and rows lined up under a locked row. Every variation hides the board's
// totals (the tool's "Tiles 12 · Area 12 square units" would give answers away).
import { boardWith, rowPlaces, objSizeOf, plural } from '../manip-task-kit.js';
import { allPieceDefs } from '../manip-data.js';
import { OBJ_HEAD } from '../manip-board.js';
import { piecesOf, inside, partsOf, lineOf, latticeOf, rectOf, shapeKey, cellsOfRows, perimeterOf } from './piece-grid.js';

export const SLUG = 'color-tiles';
const DEFS = Object.fromEntries(allPieceDefs(SLUG).map(d => [d.kind, d]));
/** The tile colors by kind (t0 red ... t5 purple), as the palette names them. */
export const TILE = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
const KINDS = TILE.map((_, i) => `t${i}`);
const name = k => TILE[+String(k).slice(1)] || 'tile';
const P = 58;   // a tile (52) and the palette's gap (6)
const S = 52;

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
let seq = 0;
/** A tile of a kind at (x, y), as the page makes one (manip.js mkPiece); label: its own face (a number line's numbers). */
const tile = (kind, x, y, locked = false, label = null) => { const d = DEFS[kind]; return { id: `t${(++seq).toString(36)}`, kind, x: Math.round(x), y: Math.round(y), rot: 0, flipped: false, filled: true, locked, color: d.color, label: label == null ? d.label : String(label), value: d.value, w: d.w, h: d.h }; };
/** Rows of tiles from (x, y): grid[r][c] a kind (or null), pitch apart. */
export const gridOf = (grid, x, y, { locked = false, pitch = P, vpitch = pitch } = {}) => grid.flatMap((row, r) => row.map((k, c) => (k ? tile(k, x + c * pitch, y + r * vpitch, locked) : null)).filter(Boolean));
/** A board: work mats in one row, centered ({ label, w, h }; one wide mat by default), and these tiles (or a function of the mats). */
export function tilesBoard(mats = [{ w: 1000, h: 420 }], pieces = []) {
  const os = mats.map((m, i) => ({ id: `m${i + 1}`, k: 'mat', s: 1, locked: true, st: { w: m.w || 440, h: m.h || 290, ...(m.label ? { label: m.label } : {}) } }));
  const places = rowPlaces(os.map(o => objSizeOf(SLUG, 'mat', o.st)));
  os.forEach((o, i) => { o.x = places[i].x; o.y = places[i].y; });
  return boardWith(SLUG, os, typeof pieces === 'function' ? pieces(os) : pieces);
}
const matIn = o => ({ x: o.x + 24, y: o.y + OBJ_HEAD + 24 });
const matRect = o => ({ x: o.x, y: o.y, w: num(o.st.w, 440), h: OBJ_HEAD + num(o.st.h, 290) });
/** A solid rectangle as a student builds it: rows flush under each other, tiles a palette gap apart in a row. */
const solid = (grid, at) => gridOf(grid, at.x, at.y, { vpitch: S });
const fill = (r, c, k) => Array.from({ length: r }, () => Array(c).fill(k));
const solvedWith = (setup, more) => ({ ...setup, pieces: [...setup.pieces, ...more] });

// ---------------------------------------------------------------- the checks
const objsOf = b => ((b && Array.isArray(b.objects)) ? b.objects : []).filter(o => o && typeof o === 'object' && o.st && typeof o.st === 'object');
/** The unlocked tiles (on the mat labeled `on`, when named); all: the locked ones too. */
function tilesOf(b, on = '', all = false) {
  const ps = piecesOf(b, KINDS, S).filter(p => all || !p.locked);
  if (!on) return ps;
  const o = objsOf(b).find(x => x.k === 'mat' && x.st.label === on);
  return o ? ps.filter(p => inside(p, matRect(o))) : [];
}
const tally = ps => { const t = {}; for (const p of ps) t[p.kind] = (t[p.kind] || 0) + 1; return t; };
const hasExactly = (ps, has) => { const t = tally(ps); return Object.keys({ ...t, ...has }).every(k => (t[k] || 0) === (has[k] || 0)); };
const dimsOk = (L, r, c) => !!L && ((L.rows === r && L.cols === c) || (L.rows === c && L.cols === r));
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
/** The kinds of a solid rectangle by place, turned so it has r rows when it can: [[kind]]. */
function gridKinds(L, r) {
  const g = Array.from({ length: L.rows }, (_, i) => Array.from({ length: L.cols }, (_, j) => L.at.get(`${i},${j}`).kind));
  return L.rows === r || !r ? g : g[0].map((_, j) => g.map(row => row[j]));
}
export const conds = {
  /** The tiles (on mat `on`) make one solid rectangle r by c (turned either way). */
  rect: (c, b) => dimsOk(rectOf(tilesOf(b, c.on)), c.r, c.c),
  /** One solid rectangle of n tiles with both sides at least minSide (sides: the exact pair, when named). */
  area: (c, b) => { const L = rectOf(tilesOf(b, c.on)); return !!L && L.rows * L.cols === c.n && Math.min(L.rows, L.cols) >= (c.minSide || 1) && (!c.not || !dimsOk(L, c.not[0], c.not[1])); },
  /** Exactly these tiles by color (unlocked ones). */
  counts: (c, b) => hasExactly(tilesOf(b, c.on), c.has),
  /** The row the locked tiles start reads `seq`, left to right, with every tile in it. */
  pattern: (c, b) => {
    const all = tilesOf(b, '', true), part = partsOf(all, 8).find(p => p.some(q => q.locked)); if (!part || part.length !== all.length) return false;
    const line = lineOf(part); return !!line && Math.abs(line[0].cy - line[line.length - 1].cy) < S / 2 && sameList(line.map(p => p.kind), c.seq);
  },
  /** A solid rectangle r by c: its outside ring of tiles in one color, the inside in another. */
  border: (c, b) => {
    const L = rectOf(tilesOf(b)); if (!dimsOk(L, c.r, c.c)) return false;
    const g = gridKinds(L, 0);
    return g.every((row, i) => row.every((k, j) => k === (i === 0 || j === 0 || i === L.rows - 1 || j === L.cols - 1 ? c.out : c.in)));
  },
  /** A solid rectangle r rows by c1 + c2 columns: the first c1 columns one color, the rest another (either end, any turn). */
  split: (c, b) => {
    const L = rectOf(tilesOf(b)); if (!dimsOk(L, c.r, c.c1 + c.c2)) return false;
    const g = gridKinds(L, c.r), want = j => (j < c.c1 ? c.a : c.b), wantR = j => (j < c.c2 ? c.b : c.a);
    return g.every(row => row.every((k, j) => k === want(j))) || g.every(row => row.every((k, j) => k === wantR(j)));
  },
  /** All the tiles (the locked quarter too) make an n by n square with two lines of symmetry. */
  quilt: (c, b) => {
    const L = rectOf(tilesOf(b, '', true)); if (!dimsOk(L, c.n, c.n)) return false;
    const g = gridKinds(L, c.n), n = c.n;
    return g.every((row, i) => row.every((k, j) => k === g[i][n - 1 - j] && k === g[n - 1 - i][j]));
  },
  /** The unlocked tiles make this shape (cells 'r,c'), turned or flipped any way. */
  shape: (c, b) => { const L = latticeOf(tilesOf(b)); return !!L && shapeKey(L.cells) === c.key; },
  /** One row of tiles right under the locked row, one under each locked tile labeled in `labels` (a number line's jump). */
  under: (c, b) => {
    const locked = tilesOf(b, '', true).filter(p => p.locked), mine = tilesOf(b); if (mine.length !== c.labels.length) return false;
    const got = mine.map(p => { const t = locked.find(q => Math.abs(q.cx - p.cx) < S / 2 && p.cy - q.cy > S / 2 && p.cy - q.cy < S * 1.9); return t ? t.label : null; });
    return got.every(Boolean) && sameList([...got].sort(), [...c.labels].map(String).sort()) && new Set(got).size === got.length;
  },
  /** One row of k tiles right under the locked row, starting at its left end (a fraction wall's row). */
  wallRow: (c, b) => {
    const locked = tilesOf(b, '', true).filter(p => p.locked).sort((x, y) => x.cx - y.cx), mine = tilesOf(b), line = lineOf(mine);
    if (!locked.length || mine.length !== c.k || !line) return false;
    const L = latticeOf(mine); if (!L || L.rows !== 1) return false;
    const first = line[0], top = locked[0];
    return Math.abs(first.cx - top.cx) < S / 2 && first.cy - top.cy > S / 2 && first.cy - top.cy < S * 1.9;
  },
};

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
const colors = (R, n) => R.shuffle(KINDS).slice(0, n);
const area = n => `${n} square units`;
/** Rows and columns of a shape given as text rows ('#' a tile). */
const LETTERS = {
  L: (h, w) => [...Array(h - 1).fill('#'.padEnd(w, '.')), '#'.repeat(w)],
  T: (h, w) => ['#'.repeat(w), ...Array(h - 1).fill('.'.repeat((w - 1) / 2) + '#' + '.'.repeat((w - 1) / 2))],
  H: (h, w) => Array.from({ length: h }, (_, i) => (i === Math.floor(h / 2) ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#')),
  U: (h, w) => [...Array(h - 1).fill('#' + '.'.repeat(w - 2) + '#'), '#'.repeat(w)],
  E: (h, w) => Array.from({ length: h }, (_, i) => (i === 0 || i === h - 1 || i === Math.floor(h / 2) ? '#'.repeat(w) : '#'.padEnd(w, '.'))),
  F: (h, w) => Array.from({ length: h }, (_, i) => (i === 0 || i === Math.floor(h / 2) ? '#'.repeat(w) : '#'.padEnd(w, '.'))),
  C: (h, w) => Array.from({ length: h }, (_, i) => (i === 0 || i === h - 1 ? '#'.repeat(w) : '#'.padEnd(w, '.'))),
  I: (h, w) => Array.from({ length: h }, (_, i) => (i === 0 || i === h - 1 ? '#'.repeat(w) : '.'.repeat((w - 1) / 2) + '#' + '.'.repeat((w - 1) / 2))),
};
/** Each letter's heights (from, to) and widths. */
const SIZES = { L: [3, 6, [2, 3, 4]], T: [3, 6, [3, 5]], H: [3, 6, [3, 4]], U: [3, 6, [3, 4, 5]], E: [5, 7, [3, 4]], F: [4, 6, [3, 4]], C: [3, 6, [3, 4]], I: [3, 6, [3, 5]] };
const NTHS = { 6: 'sixths', 8: 'eighths', 10: 'tenths', 12: 'twelfths' };
export const TASKS = [
  T('copy-the-pattern', 'Copy the pattern', 'K.G.B.5', 'K',
    'A pattern of colored tiles is started in a row. Add the next tiles to the end of the row so the pattern keeps going.',
    'Saying the pattern unit out loud (red, blue, red, blue) matters more than the tiles. Ask what the 10th tile will be without building it.',
    R => {
      const type = R.pick(['AB', 'ABB', 'AAB', 'ABC']), ks = colors(R, 3), unit = [...type].map(ch => ks['ABC'.indexOf(ch)]), k = R.int(2, 4);
      const shown = [...unit, ...unit], seq2 = Array.from({ length: shown.length + k }, (_, i) => unit[i % unit.length]);
      const setup = tilesBoard([{ w: 1000, h: 200 }], os => gridOf([shown], matIn(os[0]).x, matIn(os[0]).y + 30, { locked: true }));
      const last = setup.pieces[setup.pieces.length - 1];
      return {
        prompt: `The row shows a pattern: ${unit.map(name).join(', ')}, ${unit.map(name).join(', ')}. Add the next ${k} tiles to the end of the row so the pattern keeps going.`,
        setup, answer: { board: [{ t: 'pattern', seq: seq2, say: `Add ${k} tiles at the right end of the row, in the pattern.` }] },
        hints: [`Say the pattern out loud: ${unit.map(name).join(', ')}, and again.`, `Drop the first tile right after the last one: it is ${name(seq2[shown.length])}.`, `The next ${k}: ${seq2.slice(shown.length).map(name).join(', ')}.`],
        explain: `The part that repeats is ${unit.map(name).join(', ')}. After it ends, it starts again.`,
        solution: { board: solvedWith(setup, gridOf([seq2.slice(shown.length)], last.x + S, last.y)) },
      };
    }),
  T('area-of-a-rectangle', 'Area of a rectangle', '3.MD.C.7', '3',
    'Build a solid rectangle of tiles. Count the tiles for the area, then count the outside edges for the perimeter.',
    'Children routinely swap area and perimeter. Tiles for area, edges for perimeter: keep the two counts physically different.',
    R => {
      const a = R.int(2, 5), b = R.int(2, 7), k = R.pick(KINDS), A = a * b, Pm = 2 * (a + b);
      const opts = R.shuffle([...new Set([A, Pm, a + b, A + a])].slice(0, 3)), setup = tilesBoard();
      return {
        prompt: `Build a solid rectangle of ${name(k)} tiles, ${a} rows of ${b}. What is its area? What is its perimeter, counting the tile edges around the outside?`,
        setup, answer: { board: [{ t: 'rect', r: a, c: b, say: `Build ${a} rows of ${b} tiles with no gaps.` }, { t: 'counts', has: { [k]: A }, say: `Use ${name(k)} tiles.` }],
          choice: { options: opts.map(area), correct: opts.indexOf(A), say: 'The area is how many tiles cover it.' }, box: { key: String(Pm), label: 'perimeter (units)', say: 'The perimeter is the edges all the way around.' } },
        hints: ['Make a row, then drop a tile right under its first tile and tap to fill the next row.', `Area: ${a} rows of ${b} is ${A} tiles. Perimeter: walk around the outside, ${b} + ${a} + ${b} + ${a}.`, `Area ${A} square units, perimeter ${Pm} units.`],
        explain: `${a} × ${b} = ${A} tiles cover it (the area). ${b} + ${a} + ${b} + ${a} = ${Pm} edges go around it (the perimeter).`,
        solution: { board: solvedWith(setup, solid(fill(a, b, k), matIn(setup.objects[0]))), choice: opts.indexOf(A), box: String(Pm) },
      };
    }),
  T('same-area-different-perimeter', 'Same area, different perimeter', '4.MD.A.3', '4',
    'Use the same number of tiles to build two different rectangles, one on each mat. The areas match; do the perimeters?',
    '3 × 4 gives perimeter 14, 2 × 6 gives 16, 1 × 12 gives 26. A memorable challenge to the idea that area decides everything.',
    R => {
      // a number with two rectangles that fit a mat (at most 10 long), Rectangle 1 at most 4 rows
      const n = R.pick([4, 6, 8, 9, 10, 12, 16, 18, 20, 24]), pairs = [];
      for (let r = 1; r * r <= n; r++) if (n % r === 0 && n / r <= 10) pairs.push([r, n / r]);
      const [r1, c1] = R.pick(pairs), [r2, c2] = pairs.find(x => x[0] !== r1), turn = R.chance() && c1 <= 4 && r1 !== c1;
      const rr = turn ? c1 : r1, cc = turn ? r1 : c1, [k1, k2] = colors(R, 2);
      const setup = tilesBoard([{ label: 'Rectangle 1', w: 660, h: 300 }, { label: 'Rectangle 2', w: 660, h: 300 }]);
      const [o1, o2] = setup.objects;
      return {
        prompt: `Use ${n} tiles on each mat. On Rectangle 1, build ${rr} ${rr === 1 ? 'row' : 'rows'} of ${cc} ${name(k1)} tiles. On Rectangle 2, build a different rectangle with ${n} tiles. What is the perimeter of Rectangle 1?`,
        setup, answer: { board: [
          { t: 'rect', on: 'Rectangle 1', r: rr, c: cc, say: `On Rectangle 1, build ${rr} ${rr === 1 ? 'row' : 'rows'} of ${cc} with no gaps.` },
          { t: 'counts', on: 'Rectangle 1', has: { [k1]: n }, say: `Use ${name(k1)} tiles on Rectangle 1.` },
          { t: 'area', on: 'Rectangle 2', n, not: [r1, c1], say: `On Rectangle 2, build a different rectangle that uses ${n} tiles.` }], box: { key: String(2 * (r1 + c1)), label: 'perimeter of Rectangle 1' } },
        hints: [`Both rectangles have area ${n}. Find another pair of numbers that multiply to ${n}: ${r2} × ${c2}.`, `Rectangle 1's perimeter: ${cc} + ${rr} + ${cc} + ${rr}.`, `Rectangle 1: ${2 * (r1 + c1)} units. Rectangle 2 (${r2} by ${c2}): ${2 * (r2 + c2)} units. Same area, different perimeter.`],
        explain: `Both have area ${n} square units, but ${r1} by ${c1} has perimeter ${2 * (r1 + c1)} and ${r2} by ${c2} has ${2 * (r2 + c2)}. The longer and thinner, the bigger the perimeter.`,
        solution: { board: solvedWith(setup, [...solid(fill(rr, cc, k1), matIn(o1)), ...solid(fill(r2, c2, k2), matIn(o2))]), box: String(2 * (r1 + c1)) },
      };
    }),
  T('tile-the-fraction', 'Tile the fraction', '3.NF.A.1', '3',
    'Build a rectangle of tiles and cover a given fraction of it with a second color.',
    'The whole must be agreed first: here the whole is 8 tiles. Fractions of a set, not of a shape, is the new idea.',
    R => {
      const [r, c] = R.pick([[2, 2], [2, 3], [2, 4], [3, 2], [1, 4], [1, 6], [2, 5], [1, 8], [3, 3]]), n = r * c, k = R.int(1, n - 1), [A, B] = colors(R, 2);
      const setup = tilesBoard(), grid = fill(r, c, A); let left = k;
      for (const row of grid) for (let j = 0; j < c && left; j++, left--) row[j] = B;
      return {
        prompt: `Build a solid rectangle, ${r} ${r === 1 ? 'row' : 'rows'} of ${c}. Make exactly ${k}/${n} of it ${name(B)} and the rest ${name(A)}.`,
        setup, answer: { board: [{ t: 'rect', r, c, say: `Build ${r} ${r === 1 ? 'row' : 'rows'} of ${c} tiles with no gaps.` }, { t: 'counts', has: { [A]: n - k, [B]: k }, say: `${k}/${n}: ${k} of the ${n} tiles ${name(B)}.` }] },
        hints: [`The whole rectangle has ${n} tiles, so each tile is 1/${n}.`, `${k}/${n} means ${k} of the ${n} tiles.`, `Make ${plural(k, 'tile')} ${name(B)} and ${plural(n - k, 'tile')} ${name(A)}.`],
        explain: `The whole is ${n} tiles, so ${k} ${name(B)} tiles are ${k}/${n} of it and the ${name(A)} tiles are ${n - k}/${n}.`,
        solution: { board: solvedWith(setup, solid(grid, matIn(setup.objects[0]))) },
      };
    }),
  T('border-pattern', 'Border pattern', '4.MD.A.3', '4',
    'Build a rectangle with its border in one color and the inside in another. How many tiles of each color?',
    'Border is 16, interior is 9. Children often double-count corners, so marking corners first helps.',
    R => {
      const a = R.int(3, 5), b = R.int(3, 6), [A, B] = colors(R, 2), border = 2 * a + 2 * b - 4;
      const grid = Array.from({ length: a }, (_, i) => Array.from({ length: b }, (_, j) => (i === 0 || j === 0 || i === a - 1 || j === b - 1 ? A : B)));
      const setup = tilesBoard();
      return {
        prompt: `Build a ${a} by ${b} rectangle (${a} rows of ${b}): the border in ${name(A)} and the inside in ${name(B)}. How many ${name(A)} tiles are in the border?`,
        setup, answer: { board: [{ t: 'border', r: a, c: b, out: A, in: B, say: `${a} rows of ${b}: ${name(A)} all the way around the edge, ${name(B)} inside.` }], box: { key: String(border), label: `${name(A)} tiles` } },
        hints: [`The top and bottom rows are all ${name(A)}. The middle rows start and end with ${name(A)}.`, `Count the corners only once: ${b} + ${b} + ${a - 2} + ${a - 2}.`, `${b} + ${b} + ${a - 2} + ${a - 2} = ${border}, and ${(a - 2) * (b - 2)} inside.`],
        explain: `The border has ${border} tiles and the inside has ${a - 2} × ${b - 2} = ${(a - 2) * (b - 2)}: ${border} + ${(a - 2) * (b - 2)} = ${a * b}.`,
        solution: { board: solvedWith(setup, solid(grid, matIn(setup.objects[0]))), box: String(border) },
      };
    }),
  T('odd-and-even-areas', 'Odd and even areas', '4.OA.B.4', '4',
    'Try to build a rectangle with a number of tiles and both sides longer than 1. Can you?',
    'Prime areas only make a 1-wide strip. This is factor thinking in tile form, without naming primes yet.',
    R => {
      const n = R.int(4, 19), ds = []; for (let r = 2; r * r <= n; r++) if (n % r === 0) ds.push(r);
      const can = ds.length > 0, r = can ? R.pick(ds) : 1, c = n / r, k = R.pick(KINDS), setup = tilesBoard([{ w: 1200, h: 360 }]);
      return {
        prompt: `Use exactly ${n} ${name(k)} tiles. Build a rectangle with both sides longer than 1 tile if you can; if you can't, build one long row. Can ${n} tiles make a rectangle with both sides longer than 1?`,
        setup, answer: { board: [{ t: 'area', n, minSide: can ? 2 : 1, say: can ? `Build a rectangle of ${n} tiles with at least 2 rows.` : `Build ${n} tiles as a rectangle.` }, { t: 'counts', has: { [k]: n }, say: `Use ${n} ${name(k)} tiles.` }], choice: { options: ['Yes', 'No'], correct: can ? 0 : 1, say: `Try 2 rows, 3 rows... Does ${n} share out evenly?` } },
        hints: [`Try 2 rows: do ${n} tiles share evenly into 2 rows? Then try 3 rows.`, can ? `${n} tiles do make equal rows of more than 1.` : `No number of rows from 2 up shares ${n} evenly.`, can ? `${r} rows of ${c}: yes.` : `Only 1 row of ${n} works: no.`],
        explain: can ? `${n} = ${r} × ${c}, so ${n} tiles make a ${r} by ${c} rectangle.` : `${n} has no factor pair except 1 × ${n}, so only a strip 1 tile wide works.`,
        solution: { board: solvedWith(setup, solid(fill(r, c, k), matIn(setup.objects[0]))), choice: can ? 0 : 1 },
      };
    }),
  T('tile-a-letter', 'Tile a letter', '3.MD.C.6', '3',
    'A letter is made of tiles. Count the tiles for its area, and count the edges around it for its perimeter.',
    'Free building with a count attached keeps it mathematical. Perimeter here counts exposed edges only.',
    R => {
      const L = R.pick(Object.keys(LETTERS)), [h0, h1, ws] = SIZES[L], h = R.int(h0, h1), w = R.pick(ws), rows = LETTERS[L](h, w);
      const cells = cellsOfRows(rows), A = cells.size, Pm = perimeterOf(cells), k = R.pick(KINDS);
      const setup = tilesBoard([{ w: 600, h: 440 }], os => gridOf(rows.map(row => [...row].map(ch => (ch === '#' ? k : null))), matIn(os[0]).x + 40, matIn(os[0]).y, { locked: true, pitch: 54 }));
      const opts = R.shuffle([Pm, Pm + 2, Pm - 2]);
      return {
        prompt: `The letter ${L} is made of tiles. What is its area? Then count the tile edges all the way around the outside: what is its perimeter?`, sig: `${L} ${rows.join('/')} ${k}`,
        setup, answer: { box: { key: String(A), label: 'area (square units)' }, choice: { options: opts.map(x => `${x} units`), correct: opts.indexOf(Pm), say: 'Count every outside edge, the inside corners too.' } },
        hints: ['Count the tiles row by row for the area.', 'For the perimeter, go all the way around the outside and count each tile edge you pass.', `Area ${A} square units, perimeter ${Pm} units.`],
        explain: `${A} tiles cover the letter, so its area is ${A} square units. ${Pm} tile edges go around it, so its perimeter is ${Pm} units.`,
        solution: { board: setup, box: String(A), choice: opts.indexOf(Pm) },
      };
    }),
  T('halves-of-rectangles', 'Halves of rectangles', '3.G.A.2', '3',
    'Build a rectangle and cover exactly half of it with a second color. How many tiles make half?',
    'Half can be split by rows, columns or a staircase. All covers must total 12 tiles.',
    R => {
      const [r, c] = R.pick([[2, 4], [2, 6], [4, 4], [3, 4], [2, 8], [4, 6], [2, 2], [4, 2], [3, 2], [2, 3], [3, 6], [2, 5]]), n = r * c, [A, B] = colors(R, 2);
      const grid = Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => (i * c + j < n / 2 ? B : A))), setup = tilesBoard();
      return {
        prompt: `Build a ${r} by ${c} rectangle (${r} rows of ${c}). Make exactly half of it ${name(B)} and the other half ${name(A)}. How many tiles make half?`,
        setup, answer: { board: [{ t: 'rect', r, c, say: `Build ${r} rows of ${c} tiles with no gaps.` }, { t: 'counts', has: { [A]: n / 2, [B]: n / 2 }, say: `Half ${name(B)} and half ${name(A)}: the same number of each.` }], box: { key: String(n / 2), label: 'tiles in half' } },
        hints: [`The rectangle has ${r} × ${c} = ${n} tiles.`, 'Half means two equal parts: the same number of each color. Whole rows or whole columns make it easy.', `${n} ÷ 2 = ${n / 2}.`],
        explain: `${n} tiles in two equal parts is ${n / 2} each. Any ${n / 2} tiles are half of the area, whatever their shape.`,
        solution: { board: solvedWith(setup, solid(grid, matIn(setup.objects[0]))), box: String(n / 2) },
      };
    }),
  T('multiplication-grid', 'Multiplication grid', '3.OA.B.5', '3',
    'Build a rectangle split into two colors, like 6 by 7 as 6 by 5 and 6 by 2. Use the two parts to find the product.',
    'Splitting one factor is the distributive property with tiles. The two smaller rectangles must add to the original area.',
    R => {
      const r = R.int(2, 4), c = R.int(6, 9), c1 = 5, c2 = c - 5, [A, B] = colors(R, 2), setup = tilesBoard();
      return {
        prompt: `Build ${r} rows of ${c}: in each row, ${c1} ${name(A)} tiles then ${c2} ${name(B)}. Use the parts ${r} × ${c1} and ${r} × ${c2}. What is ${r} × ${c}?`,
        setup, answer: { board: [{ t: 'split', r, c1, c2, a: A, b: B, say: `${r} rows: each one ${c1} ${name(A)} and then ${c2} ${name(B)}, no gaps.` }], box: { key: String(r * c), label: `${r} × ${c}` } },
        hints: [`The ${name(A)} part is ${r} × ${c1} = ${r * c1}.`, `The ${name(B)} part is ${r} × ${c2} = ${r * c2}.`, `${r * c1} + ${r * c2} = ${r * c}.`],
        explain: `${r} × ${c} = ${r} × ${c1} + ${r} × ${c2} = ${r * c1} + ${r * c2} = ${r * c}. Splitting ${c} into ${c1} and ${c2} makes it easier.`,
        solution: { board: solvedWith(setup, solid(Array.from({ length: r }, () => [...Array(c1).fill(A), ...Array(c2).fill(B)]), matIn(setup.objects[0]))), box: String(r * c) },
      };
    }),
  T('tile-symmetry-quilt', 'Tile symmetry quilt', '4.G.A.3', '4',
    'A quarter of a 4 by 4 quilt is locked in place. Finish the quilt so it has two lines of symmetry.',
    'Checking a partner\'s symmetry is harder than making your own and surfaces small mismatches quickly.',
    R => {
      const ks = colors(R, 3); let q;
      do { q = [[R.pick(ks), R.pick(ks)], [R.pick(ks), R.pick(ks)]]; } while (new Set(q.flat()).size < 2);
      const full = [[q[0][0], q[0][1], q[0][1], q[0][0]], [q[1][0], q[1][1], q[1][1], q[1][0]]];
      const grid = [...full, [...full[1]], [...full[0]]];
      const setup = tilesBoard([{ w: 700, h: 360 }], os => gridOf(q, matIn(os[0]).x + 120, matIn(os[0]).y, { locked: true }));
      const [t00, t01] = setup.pieces;
      return {
        prompt: `The top left quarter of a 4 by 4 quilt is locked. Finish the quilt so it is the same on both sides of the middle line across and the middle line down. Use 12 more tiles.`, sig: q.flat().join(' '),
        setup, answer: { board: [{ t: 'quilt', n: 4, say: 'Make a 4 by 4 square: each half mirrors the other, across and down.' }] },
        hints: ['The top right quarter is the top left one flipped over the line down the middle.', `The top row reads ${full[0].map(name).join(', ')}.`, `The bottom half mirrors the top: row 3 is ${full[1].map(name).join(', ')} and row 4 is ${full[0].map(name).join(', ')}.`],
        explain: 'Each tile matches its mirror tile across the middle line down and across the middle line across, so the quilt has two lines of symmetry.',
        solution: { board: { ...setup, pieces: [...setup.pieces, ...gridOf([[full[0][2], full[0][3]], [full[1][2], full[1][3]]], t01.x + S, t00.y, { vpitch: P }), ...gridOf([grid[2], grid[3]], t00.x, t00.y + P + S, { vpitch: S })] } },
      };
    }),
  T('growing-border', 'Growing border', '4.OA.C.5', '4',
    'Stage 1 is 1 tile; each stage adds a border around the last: 3 by 3, then 5 by 5. Build a stage and find the pattern.',
    'Totals are odd squares 1, 9, 25. The border added each time grows by 8, which strong finishers can explain.',
    R => {
      const k = R.int(2, 3), m = R.int(k + 1, 9), ask = R.pick(['all', 'border']), s = 2 * k - 1, [A, B] = colors(R, 2);
      const grid = Array.from({ length: s }, (_, i) => Array.from({ length: s }, (_, j) => (Math.max(Math.abs(i - (s - 1) / 2), Math.abs(j - (s - 1) / 2)) % 2 ? A : B)));
      const key = ask === 'all' ? (2 * m - 1) ** 2 : 8 * (m - 1), setup = tilesBoard();
      return {
        prompt: `Stage 1 is 1 tile. Each stage adds a border around the stage before: stage 2 is 3 by 3, stage 3 is 5 by 5. Build stage ${k}. ${ask === 'all' ? `How many tiles does stage ${m} have in all?` : `How many tiles does the border of stage ${m} add?`}`,
        setup, answer: { board: [{ t: 'rect', r: s, c: s, say: `Stage ${k} is a ${s} by ${s} square with no gaps.` }], box: { key: String(key), label: ask === 'all' ? 'tiles in all' : 'tiles in the border' } },
        hints: [`Stage n is a square ${'2n − 1'} tiles on a side: stage ${m} is ${2 * m - 1} by ${2 * m - 1}.`, ask === 'all' ? `${2 * m - 1} × ${2 * m - 1} tiles.` : `Each border adds 8 more than the one before: 8, 16, 24...`, ask === 'all' ? `${2 * m - 1} × ${2 * m - 1} = ${key}.` : `Stage ${m}'s border: 8 × ${m - 1} = ${key}.`],
        explain: ask === 'all' ? `The totals are 1, 9, 25, 49...: stage ${m} is ${2 * m - 1} × ${2 * m - 1} = ${key}.` : `The borders add 8, 16, 24...: stage ${m} adds ${(2 * m - 1) ** 2} − ${(2 * m - 3) ** 2} = ${key}.`,
        solution: { board: solvedWith(setup, solid(grid, matIn(setup.objects[0]))), box: String(key) },
      };
    }),
  T('fraction-wall-tiles', 'Fraction wall tiles', '4.NF.A.1', '4',
    'A row of tiles is the whole. Under it, build a row that shows a fraction of the whole, lined up at the left. How many of the whole\'s parts is it?',
    'Lining up fractions of the same whole lets children compare sizes directly and spot equivalences like 2/4.',
    R => {
      const n = R.pick([6, 8, 10, 12]), ds = [2, 3, 4, 5, 6].filter(d => n % d === 0 && d < n), d = R.pick(ds), a = R.int(1, d - 1), k = (n / d) * a, [A, B] = colors(R, 2);
      const setup = tilesBoard([{ w: 900, h: 260 }], os => gridOf([Array(n).fill(A)], matIn(os[0]).x, matIn(os[0]).y, { locked: true }));
      const first = setup.pieces[0];
      return {
        prompt: `The ${name(A)} row of ${n} tiles is the whole. Right under it, starting at the left, build a row of ${name(B)} tiles that is ${a}/${d} of the whole. ${a}/${d} = ?/${n}`,
        setup, answer: { board: [{ t: 'wallRow', k, say: `Build one row under the whole, starting at its left end, ${a}/${d} as long.` }, { t: 'counts', has: { [B]: k }, say: `Use ${name(B)} tiles.` }], box: { key: String(k), label: NTHS[n] } },
        hints: [`Split the whole row of ${n} into ${d} equal parts: each part is ${n / d} tiles.`, `${a}/${d} is ${a} of those parts: ${a} × ${n / d} tiles.`, `${a}/${d} = ${k}/${n}: build ${k} tiles.`],
        explain: `${a}/${d} of ${n} tiles is ${k} tiles, so ${a}/${d} = ${k}/${n}. Lined up under the whole, the two rows show the fractions are equal.`,
        solution: { board: solvedWith(setup, gridOf([Array(k).fill(B)], first.x, first.y + S)), box: String(k) },
      };
    }),
  T('area-challenge-20', 'Area challenge 20', '4.MD.A.3', '4',
    'Use a number of tiles to make the rectangle with the smallest possible perimeter, or the largest. What is its perimeter?',
    'Compact shapes minimize perimeter, long thin shapes maximize it. Same area, very different borders.',
    R => {
      const big = R.chance(0.4), n = big ? R.int(5, 14) : R.pick([6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 24, 25, 28, 30]);
      let r = 1; if (!big) for (let x = 1; x * x <= n; x++) if (n % x === 0) r = x;
      const c = n / r, k = R.pick(KINDS), setup = tilesBoard([{ w: 1000, h: 400 }]);
      return {
        prompt: `Use exactly ${n} tiles to build the rectangle with the ${big ? 'largest' : 'smallest'} possible perimeter. What is its perimeter?`,
        setup, answer: { board: [{ t: 'rect', r, c, say: big ? `The longest, thinnest rectangle of ${n} tiles has the largest perimeter.` : `The rectangle of ${n} tiles closest to a square has the smallest perimeter.` }], box: { key: String(2 * (r + c)), label: 'perimeter (units)' } },
        hints: [`List the rectangles of ${n} tiles: 1 by ${n}${n % 2 ? '' : `, 2 by ${n / 2}`}, and so on.`, big ? 'A long, thin strip has the most edges around it.' : 'The closer to a square, the shorter the way around.', `${r} by ${c}: ${c} + ${r} + ${c} + ${r} = ${2 * (r + c)}.`],
        explain: `Of all the rectangles with area ${n}, ${r} by ${c} has the ${big ? 'largest' : 'smallest'} perimeter: ${2 * (r + c)} units.`,
        solution: { board: solvedWith(setup, solid(fill(r, c, k), matIn(setup.objects[0]))), box: String(2 * (r + c)) },
      };
    }),
  T('tile-number-line', 'Tile number line', '2.MD.B.6', '2',
    'A row of 20 tiles is a number line, with every fifth tile in a second color. Show a jump with tiles under it and count the jump.',
    'A tiled line makes intervals countable. The jump length is a difference, counted in tiles.',
    R => {
      let a, b; do { a = R.int(0, 16); b = R.int(a + 3, 20); } while (b - a > 12);
      const setup = tilesBoard([{ w: 1300, h: 220 }], os => Array.from({ length: 20 }, (_, i) => tile((i + 1) % 5 ? 't2' : 't4', matIn(os[0]).x + i * P, matIn(os[0]).y, true, i + 1)));
      const at = setup.pieces[a];
      return {
        prompt: `The row of tiles is a number line from 0 to 20: tile 1 ends at 1, tile 2 at 2, and so on. Show the jump from ${a} to ${b}: put a red tile under each tile from ${a + 1} to ${b}. How long is the jump?`,
        setup, answer: { board: [{ t: 'under', labels: Array.from({ length: b - a }, (_, i) => a + 1 + i), say: `Put one red tile under each tile from ${a + 1} to ${b}, right under the row.` }, { t: 'counts', has: { t0: b - a }, say: 'Use red tiles for the jump.' }], box: { key: String(b - a), label: 'the jump' } },
        hints: [`Drop a red tile right under tile ${a + 1}, then tap to add more along the row.`, `Stop under tile ${b}. Count your red tiles.`, `${b} − ${a} = ${b - a}.`],
        explain: `From ${a} to ${b} is ${b - a} steps: ${b} − ${a} = ${b - a}. Each red tile is one step.`,
        solution: { board: solvedWith(setup, gridOf([Array(b - a).fill('t0')], at.x, at.y + S)), box: String(b - a) },
      };
    }),
  T('cover-without-gaps', 'Cover without gaps', '3.MD.C.7a', '3',
    'Cover an L-shaped card with tiles, with no gaps and no overlaps. How many tiles does it take?',
    'Tessellation language belongs here: no gaps, no overlaps. The L-shape forces row-by-row thinking.',
    R => {
      const r = R.int(3, 5), c = R.int(3, 6), r2 = R.int(1, r - 1), c2 = R.int(1, c - 1), k = R.pick(KINDS);
      const rows = Array.from({ length: r }, (_, i) => '#'.repeat(i < r2 ? c - c2 : c).padEnd(c, '.')), cells = cellsOfRows(rows), n = cells.size;
      const setup = tilesBoard();
      return {
        prompt: `An L-shaped card is ${r} rows of ${c} with a ${r2} by ${c2} piece cut from the top right corner. Cover it with tiles: no gaps, no overlaps. How many tiles does it take?`,
        setup, answer: { board: [{ t: 'shape', key: shapeKey(cells), say: `Build the L: the top ${r2 === 1 ? 'row has' : `${r2} rows have`} ${plural(c - c2, 'tile')}, the other rows ${c}.` }], box: { key: String(n), label: 'tiles' } },
        hints: [`Split the L into two rectangles: ${r} by ${c - c2} and ${r - r2} by ${c2}.`, `${r} × ${c - c2} = ${r * (c - c2)} and ${r - r2} × ${c2} = ${(r - r2) * c2}.`, `${r * (c - c2)} + ${(r - r2) * c2} = ${n}, or ${r * c} − ${r2 * c2} = ${n}.`],
        explain: `The L takes ${n} tiles: the whole ${r} by ${c} rectangle is ${r * c}, and the cut corner is ${r2 * c2}, so ${r * c} − ${r2 * c2} = ${n}.`,
        solution: { board: solvedWith(setup, solid(rows.map(row => [...row].map(ch => (ch === '#' ? k : null))), matIn(setup.objects[0]))), box: String(n) },
      };
    }),
  T('percent-tiles', 'Percent tiles', '6.RP.A.3c', '6',
    'A rectangle of tiles is the whole, with some tiles blue. What percent is blue, and what percent is not?',
    'A hundred grid is the percent model: each tile is 1 percent. The uncovered 65 percent completes the picture.',
    R => {
      const [r, c] = R.pick([[10, 10], [10, 10], [4, 5], [5, 5], [5, 10]]), n = r * c, k = R.int(1, n - 1), not = R.chance(), pct = (k * 100) / n, want = not ? 100 - pct : pct;
      const setup = tilesBoard([{ w: 640, h: 600 }], os => gridOf(Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => (i * c + j < k ? 't4' : 't2'))), matIn(os[0]).x + 20, matIn(os[0]).y, { locked: true, pitch: 54 }));
      return {
        prompt: `The ${r} by ${c} rectangle of ${n} tiles is the whole. Some tiles are blue. What percent of the whole is ${not ? 'not blue' : 'blue'}?`, sig: `${n} ${k} ${not}`,
        setup, answer: { box: { key: String(want), keys: [String(want), `${want}%`], label: 'percent' } },
        hints: [n === 100 ? 'Each tile is 1 out of 100: 1 percent.' : `Each tile is 1 out of ${n}, which is ${100 / n} out of 100: ${100 / n} percent.`, `Count the blue tiles: ${k}. ${not ? `Then ${n - k} are not blue.` : ''}`.trim(), `${not ? n - k : k} out of ${n} is ${want} out of 100: ${want}%.`],
        explain: `${k} of ${n} tiles are blue: ${pct}%. The rest, ${n - k} tiles, are ${100 - pct}%. Together they make 100%.`,
        solution: { board: setup, box: String(want) },
      };
    }),
  T('ratio-tiles', 'Ratio tiles', '6.RP.A.1', '6',
    'Show a ratio of blue to red tiles, then make it a few times as big. How many red tiles go with the blue ones?',
    'Scaling a ratio keeps the relationship while totals grow. Children should say for every 2 blue there are 3 red.',
    R => {
      let a, b; do { a = R.int(1, 5); b = R.int(1, 5); } while (a === b);
      const k = R.int(2, 4), setup = tilesBoard();
      return {
        prompt: `For every ${a} blue ${a === 1 ? 'tile' : 'tiles'} there ${b === 1 ? 'is' : 'are'} ${b} red. Build the ratio ${k} times over, with ${k * a} blue tiles. How many red tiles go with them?`,
        setup, answer: { board: [{ t: 'counts', has: { t4: k * a, t0: k * b }, say: `Build ${k} groups, each with ${a} blue and ${b} red.` }], box: { key: String(k * b), label: 'red tiles' } },
        hints: [`One group is ${a} blue and ${b} red. Build ${k} of them.`, `${k * a} blue is ${k} groups of ${a}, so the red is ${k} groups of ${b}.`, `${k} × ${b} = ${k * b} red tiles.`],
        explain: `${a} : ${b} is the same ratio as ${k * a} : ${k * b}: for every ${a} blue there are still ${b} red.`,
        solution: { board: solvedWith(setup, gridOf(Array.from({ length: k }, () => [...Array(a).fill('t4'), ...Array(b).fill('t0')]), matIn(setup.objects[0]).x, matIn(setup.objects[0]).y, { vpitch: 70 })), box: String(k * b) },
      };
    }),
];
