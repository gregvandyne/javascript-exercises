// Linking Cubes: the tool's 17 tasks as practice (docs/manip-practice-tasks.md). As in rekenreks.js: each task keeps
// its title, code, grade and notes; make(R) gives one variation; conds are this tool's board checks, read from the
// board's cubes (piece-grid.js): sticks (cubes end to end in one straight line, snapped or added in a row from the
// palette), arrays (rows and columns), colors, and which work mat a cube sits on. Every variation hides the board's
// totals (the tool's "Cubes 12" would give answers away).
import { boardWith, rowPlaces, objSizeOf, plural } from '../manip-task-kit.js';
import { allPieceDefs } from '../manip-data.js';
import { OBJ_HEAD } from '../manip-board.js';
import { piecesOf, inside, sticksOf, partsOf, lineOf, rectOf } from './piece-grid.js';

export const SLUG = 'linking-cubes';
const DEFS = Object.fromEntries(allPieceDefs(SLUG).map(d => [d.kind, d]));
/** The cube colors by kind (c0 red ... c9 black), as the palette names them. */
export const CUBE = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'black'];
const KINDS = CUBE.map((_, i) => `c${i}`);
const name = k => CUBE[+String(k).slice(1)] || 'cube';
const cap = s => s[0].toUpperCase() + s.slice(1);
const P = 46;   // a cube (40) and the palette's gap (6)

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
let seq = 0;
/** A cube of a kind at (x, y), as the page makes one (manip.js mkPiece). */
const cube = (kind, x, y, locked = false) => { const d = DEFS[kind]; return { id: `k${(++seq).toString(36)}`, kind, x: Math.round(x), y: Math.round(y), rot: 0, flipped: false, filled: true, locked, color: d.color, label: d.label, value: d.value, w: d.w, h: d.h }; };
/** A row of cubes (kinds) from (x, y), P apart: a stick as the palette lays one. */
export const rowOf = (kinds, x, y, locked = false) => kinds.map((k, i) => cube(k, x + i * P, y, locked));
/** A board: work mats in one row, centered ({ label, w, h }; one wide mat by default), and these cubes. */
export function cubesBoard(mats = [{ w: 900, h: 360 }], pieces = []) {
  const os = mats.map((m, i) => ({ id: `m${i + 1}`, k: 'mat', s: 1, locked: true, st: { w: m.w || 440, h: m.h || 290, ...(m.label ? { label: m.label } : {}) } }));
  const places = rowPlaces(os.map(o => objSizeOf(SLUG, 'mat', o.st)));
  os.forEach((o, i) => { o.x = places[i].x; o.y = places[i].y; });
  return boardWith(SLUG, os, typeof pieces === 'function' ? pieces(os) : pieces);
}
/** Where a mat's cubes start (its top left, inside), and its rectangle. */
const matIn = o => ({ x: o.x + 20, y: o.y + OBJ_HEAD + 20 });
const matRect = o => ({ x: o.x, y: o.y, w: num(o.st.w, 440), h: OBJ_HEAD + num(o.st.h, 290) });
/** Sticks laid out on a mat, one under another (each [kind...]). */
const sticksOn = (o, list, gap = 80) => list.flatMap((ks, i) => rowOf(ks, matIn(o).x, matIn(o).y + i * gap));
const solvedWith = (setup, more) => ({ ...setup, pieces: [...setup.pieces, ...more] });

// ---------------------------------------------------------------- the checks
const objsOf = b => ((b && Array.isArray(b.objects)) ? b.objects : []).filter(o => o && typeof o === 'object' && o.st && typeof o.st === 'object');
/** The unlocked cubes (on the mat labeled `on`, when named). */
function cubesOf(b, on = '') {
  const ps = piecesOf(b, KINDS, 40).filter(p => !p.locked);
  if (!on) return ps;
  const o = objsOf(b).find(x => x.k === 'mat' && x.st.label === on);
  return o ? ps.filter(p => inside(p, matRect(o))) : [];
}
const sizes = ps => sticksOf(ps).sticks.map(s => s.length).sort((a, b) => a - b);
const allSticks = ps => sticksOf(ps).other.length === 0;
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const tally = ps => { const t = {}; for (const p of ps) t[p.kind] = (t[p.kind] || 0) + 1; return t; };
const hasExactly = (ps, has) => { const t = tally(ps); return Object.keys({ ...t, ...has }).every(k => (t[k] || 0) === (has[k] || 0)); };
export const conds = {
  /** The cubes (on mat `on`) are sticks of exactly these lengths (any order), nothing else. */
  sticks: (c, b) => { const ps = cubesOf(b, c.on); return allSticks(ps) && sameList(sizes(ps), [...c.sizes].sort((x, y) => x - y)); },
  /** Two sticks making n in all, not split as `not` (a pair of lengths), on mat `on`. */
  twoSticks: (c, b) => {
    const ps = cubesOf(b, c.on), s = sizes(ps);
    return allSticks(ps) && s.length === 2 && s[0] + s[1] === c.n && s[0] > 0 && (!c.not || !sameList(s, [...c.not].sort((x, y) => x - y)));
  },
  /** One stick for each bar: exactly n cubes, all of its color; nothing else. */
  bars: (c, b) => {
    const ps = cubesOf(b, c.on), { sticks, other } = sticksOf(ps); if (other.length || sticks.length !== c.bars.length) return false;
    const left = [...sticks];
    return c.bars.every(bar => { const i = left.findIndex(s => s.length === bar.n && s.every(p => p.kind === bar.kind)); if (i < 0) return false; left.splice(i, 1); return true; });
  },
  /** The cubes make one solid array of r rows and c columns (turned either way). */
  rect: (c, b) => { const L = rectOf(cubesOf(b, c.on), 14); return !!L && ((L.rows === c.r && L.cols === c.c) || (L.rows === c.c && L.cols === c.r)); },
  /** Exactly these cubes by color (unlocked ones). */
  counts: (c, b) => hasExactly(cubesOf(b, c.on), c.has),
  /** One stick holding these cubes by color, nothing else. */
  stickHas: (c, b) => { const ps = cubesOf(b, c.on), { sticks, other } = sticksOf(ps); return !other.length && sticks.length === 1 && hasExactly(sticks[0], c.has); },
  /** The stick with the locked cubes reads the pattern and then its mirror image (either end first). */
  mirror: (c, b) => {
    const all = piecesOf(b, KINDS, 40), part = partsOf(all).find(p => p.some(q => q.locked)); if (!part || part.length !== all.length) return false;
    const line = lineOf(part); if (!line) return false;
    const want = [...c.pattern, ...[...c.pattern].reverse()], got = line.map(p => p.kind);
    return sameList(got, want) || sameList([...got].reverse(), want);
  },
  /** n cubes, all inside a rectangle (the card inside the frame), as one solid array r by c. */
  inside: (c, b) => { const ps = cubesOf(b); return ps.length === c.r * c.c && ps.every(p => inside(p, c.box)) && conds.rect(c, b); },
  /** k sticks of exactly 10, and the other cubes (fewer than 10 in any stick) making `extra`. */
  tens: (c, b) => {
    const { sticks, other } = sticksOf(cubesOf(b)), ten = sticks.filter(s => s.length === 10), rest = [...sticks.filter(s => s.length !== 10), ...other];
    return ten.length === c.k && rest.every(s => s.length < 10) && rest.reduce((n, s) => n + s.length, 0) === c.extra;
  },
};

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
const colors = (R, n) => R.shuffle(KINDS).slice(0, n);
const run = (k, n) => Array(n).fill(k);
/** The numbers said counting on from a to n ("4, 5, 6" or "4, 5, ... up to 9"). */
const countOn = (a, n) => (n - a <= 3 ? Array.from({ length: n - a }, (_, i) => a + 1 + i).join(', ') : `${a + 1}, ${a + 2}, ... up to ${n}`);
export const TASKS = [
  T('build-and-break-8', 'Build and break a number', 'K.OA.A.3', 'K',
    'Make a number as two sticks, two different ways: on Way 1 the split it names, on Way 2 a different split.',
    'Record every split on the board. Children see that 8 stays 8 however it is split, the foundation of number bonds.',
    R => {
      const n = R.int(5, 10), a = R.int(1, n - 1), b = [1, 2, 3, 4].find(x => x !== a && x !== n - a);
      const [k1, k2] = colors(R, 2);
      const setup = cubesBoard([{ label: 'Way 1', w: 520, h: 240 }, { label: 'Way 2', w: 520, h: 240 }]);
      const [o1, o2] = setup.objects;
      return {
        prompt: `Show ${n} as two sticks, two ways. On Way 1, make a stick of ${a} and a stick of ${n - a}. On Way 2, make ${n} with two sticks split a different way.`,
        setup, answer: { board: [
          { t: 'sticks', on: 'Way 1', sizes: [a, n - a], say: `On Way 1, make a stick of ${a} and a stick of ${n - a}.` },
          { t: 'twoSticks', on: 'Way 2', n, not: [a, n - a], say: `On Way 2, make two sticks that are ${n} in all, split a new way.` }] },
        hints: ['Drag a cube onto the mat, then tap the palette: the next cubes join it in a stick.', `Way 2: try a stick of ${b} and a stick of ${n - b}.`, `${a} + ${n - a} = ${n} and ${b} + ${n - b} = ${n}.`],
        explain: `${a} and ${n - a} make ${n}, and so do ${b} and ${n - b}. However you break the stick, it is still ${n} cubes.`,
        solution: { board: solvedWith(setup, [...sticksOn(o1, [run(k1, a), run(k2, n - a)]), ...sticksOn(o2, [run(k1, b), run(k2, n - b)])]) },
      };
    }),
  T('cube-bar-graph', 'Cube bar graph', '1.MD.C.4', '1',
    'Build a bar of cubes for each color in a vote. Which color has the most? How many more than the color with the fewest?',
    'Towers must share a baseline or comparisons mislead. Ask children to line towers up and count the difference directly.',
    R => {
      const ks = colors(R, 3); let ns; do { ns = ks.map(() => R.int(2, 9)); } while (new Set(ns).size < 3);
      const hi = ns.indexOf(Math.max(...ns)), lo = ns.indexOf(Math.min(...ns)), d = ns[hi] - ns[lo];
      const setup = cubesBoard();
      return {
        prompt: `In a vote, ${ns[0]} kids picked ${name(ks[0])}, ${ns[1]} picked ${name(ks[1])} and ${ns[2]} picked ${name(ks[2])}. Build a bar of cubes in each color. Which has the most? How many more than ${name(ks[lo])}?`,
        setup, answer: { board: [{ t: 'bars', bars: ks.map((kind, i) => ({ kind, n: ns[i] })), say: 'Make one stick for each color, with one cube for each vote.' }],
          choice: { options: ks.map(k => cap(name(k))), correct: hi, say: 'Which bar is the longest?' }, box: { key: String(d), label: `more than ${name(ks[lo])}` } },
        hints: ['Make each bar in its own row, starting at the same left edge.', `The longest bar has the most. Line it up with the ${name(ks[lo])} bar.`, `${ns[hi]} − ${ns[lo]} = ${d}.`],
        explain: `${cap(name(ks[hi]))} has ${ns[hi]} and ${name(ks[lo])} has ${ns[lo]}. The ${plural(d, 'cube')} with no partner ${d === 1 ? 'shows' : 'show'} how many more.`,
        solution: { board: solvedWith(setup, sticksOn(setup.objects[0], ks.map((k, i) => run(k, ns[i])))), choice: hi, box: String(d) },
      };
    }),
  T('arrays-for-12', 'Arrays for a number', '3.OA.B.5', '3',
    'Build a number of cubes as an array with a given number of rows. How many cubes are in each row?',
    '2 × 6, 3 × 4 and their turns. Children discover factor pairs concretely before the word factor is introduced.',
    R => {
      const n = R.pick([12, 16, 18, 20, 24, 30]), fs = []; for (let r = 2; r <= 6; r++) if (n % r === 0 && n / r <= 10 && n / r > 1) fs.push(r);
      const r = R.pick(fs), c = n / r, k = R.pick(KINDS);
      const setup = cubesBoard();
      return {
        prompt: `Build ${n} ${name(k)} cubes as an array with ${r} rows, the same number in each row. How many cubes are in each row? Write it as ${r} × ? = ${n}.`,
        setup, answer: { board: [{ t: 'rect', r, c, say: `Make ${r} rows with the same number of cubes, ${n} in all, with no gaps.` }, { t: 'counts', has: { [k]: n }, say: `Use ${n} ${name(k)} cubes.` }], box: { key: String(c), label: 'in each row' } },
        hints: [`Make a row, then drop a cube right under its first cube and tap to fill the next row.`, `Share ${n} into ${r} equal rows.`, `${r} × ${c} = ${n}: ${c} in each row.`],
        explain: `${r} × ${c} = ${n}. ${r} and ${c} are a factor pair of ${n}; turning the array gives ${c} × ${r}.`,
        solution: { board: solvedWith(setup, Array.from({ length: r }, (_, i) => rowOf(run(k, c), matIn(setup.objects[0]).x, matIn(setup.objects[0]).y + i * 40)).flat()), box: String(c) },
      };
    }),
  T('staircase-sums', 'Staircase sums', '4.OA.C.5', '4',
    'Build a staircase of sticks: 1 cube, 2 cubes, 3 cubes and so on. How many cubes would a bigger staircase need?',
    'Totals are the triangular numbers 1, 3, 6, 10, 15. Strong finishers can hunt for the rule: each step adds one more than the last.',
    R => {
      const k = R.int(3, 5), m = R.int(k + 1, 12), tot = (m * (m + 1)) / 2, kind = R.pick(KINDS);
      const setup = cubesBoard([{ w: 700, h: 400 }]);
      return {
        prompt: `Build a staircase of ${name(kind)} sticks with ${k} steps: a stick of 1, a stick of 2, and so on up to ${k}. How many cubes would a staircase with ${m} steps need?`,
        setup, answer: { board: [{ t: 'sticks', sizes: Array.from({ length: k }, (_, i) => i + 1), say: `Make sticks of 1, 2, ... up to ${k}, one of each.` }], box: { key: String(tot), label: 'cubes' } },
        hints: [`Your ${k} steps use ${(k * (k + 1)) / 2} cubes. Each new step adds one more cube than the last.`, `Add on: ${Array.from({ length: m - k }, (_, i) => `+ ${k + 1 + i}`).slice(0, 3).join(', ')}${m - k > 3 ? `, ... up to + ${m}` : ''}.`, `1 + 2 + ... + ${m} = ${tot}.`],
        explain: `A staircase of ${m} steps uses 1 + 2 + ... + ${m} = ${tot} cubes.`,
        solution: { board: solvedWith(setup, sticksOn(setup.objects[0], Array.from({ length: k }, (_, i) => run(kind, i + 1)), 56)), box: String(tot) },
      };
    }),
  T('train-lengths', 'Train lengths', '1.MD.A.2', '1',
    'Build three cube trains, order them shortest to longest, and find how much longer the longest is than the shortest.',
    'Comparing lengths by direct alignment is early measurement. The difference is counted in cube units.',
    R => {
      const ls = R.shuffle([2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, 3), lo = Math.min(...ls), hi = Math.max(...ls);
      const setup = cubesBoard(), ks = colors(R, 3);
      return {
        prompt: `Build three cube trains: ${ls[0]}, ${ls[1]} and ${ls[2]} cubes long. Line them up at one end. How many cubes longer is the longest train than the shortest?`,
        setup, answer: { board: [{ t: 'sticks', sizes: ls, say: `Make three trains: ${ls.join(', ')} cubes.` }], box: { key: String(hi - lo), label: 'cubes longer' } },
        hints: ['Make each train in its own row, starting at the same left edge.', `The shortest is ${lo} and the longest is ${hi}. Count the cubes past the end of the shortest.`, `${hi} − ${lo} = ${hi - lo}.`],
        explain: `Shortest to longest: ${[...ls].sort((a, b) => a - b).join(', ')}. The longest is ${hi - lo} cubes longer than the shortest.`,
        solution: { board: solvedWith(setup, sticksOn(setup.objects[0], ls.map((l, i) => run(ks[i], l)))), box: String(hi - lo) },
      };
    }),
  T('measure-with-cubes', 'Measure with cubes', '2.MD.A.1', '2',
    'Build a cube train as long as each object on its own mat. Which object needed more cubes, and how many more?',
    'Non-standard units are honest measurement if cubes are placed end to end with no gaps. Name the unit every time.',
    R => {
      const [A, B] = R.shuffle(['Pencil', 'Book', 'Crayon', 'Spoon', 'Shoe', 'Eraser', 'Ruler', 'Marker']).slice(0, 2);
      let la, lb; do { la = R.int(3, 10); lb = R.int(3, 10); } while (la === lb);
      const setup = cubesBoard([{ label: A, w: 520, h: 150 }, { label: B, w: 520, h: 150 }]), [o1, o2] = setup.objects, k = R.pick(KINDS);
      return {
        prompt: `The ${A.toLowerCase()} is as long as ${la} cubes and the ${B.toLowerCase()} is as long as ${lb} cubes. Build each one as a cube train on its mat, end to end. Which needed more cubes, and how many more?`,
        setup, answer: { board: [{ t: 'sticks', on: A, sizes: [la], say: `On the ${A} mat, make one train of ${la} cubes.` }, { t: 'sticks', on: B, sizes: [lb], say: `On the ${B} mat, make one train of ${lb} cubes.` }],
          choice: { options: [`The ${A.toLowerCase()}`, `The ${B.toLowerCase()}`], correct: la > lb ? 0 : 1, say: 'Which train is longer?' }, box: { key: String(Math.abs(la - lb)), label: 'cubes more' } },
        hints: ['Put the cubes end to end with no gaps: each cube is one unit.', 'Line the two trains up. Which one is longer?', `${Math.max(la, lb)} − ${Math.min(la, lb)} = ${Math.abs(la - lb)}.`],
        explain: `The ${(la > lb ? A : B).toLowerCase()} is ${Math.max(la, lb)} cubes long, ${Math.abs(la - lb)} more than the ${(la > lb ? B : A).toLowerCase()}.`,
        solution: { board: solvedWith(setup, [...sticksOn(o1, [run(k, la)]), ...sticksOn(o2, [run(k, lb)])]), choice: la > lb ? 0 : 1, box: String(Math.abs(la - lb)) },
      };
    }),
  T('make-a-meter-of-cubes', 'Make a meter of cubes', '2.NBT.A.2', '2',
    'Build a number of cubes as sticks of 10 and loose cubes, counting by tens. A line of 100 is 10 sticks of 10: how many more cubes make 100?',
    'Ten sticks of ten makes one hundred visible as a length. This links counting, grouping and place value.',
    R => {
      const k = R.int(2, 4), j = R.int(0, 9), n = 10 * k + j, kind = R.pick(KINDS);
      const setup = cubesBoard([{ w: 900, h: 420 }]);
      return {
        prompt: `Build ${n} cubes: snap them into sticks of 10${j ? ' and leave the extra cubes loose' : ''}. Count by tens as you go. A line of 100 cubes is 10 sticks of 10. How many more cubes would make 100?`,
        setup, answer: { board: [{ t: 'tens', k, extra: j, say: `Make ${k} sticks of exactly 10${j ? ` and ${plural(j, 'more cube', 'more cubes')}` : ''}.` }], box: { key: String(100 - n), label: 'more cubes' } },
        hints: [`${n} is ${k} tens${j ? ` and ${plural(j, 'one')}` : ''}: make ${k} sticks of 10.`, `Count on by tens from ${n}: ${n + 10}, ${n + 20}, ... How far to 100?`, `${n} + ${100 - n} = 100.`],
        explain: `${n} + ${100 - n} = 100. 100 cubes is 10 sticks of 10${j ? '' : `, and you have ${k}, so ${10 - k} more sticks`}.`,
        solution: { board: solvedWith(setup, [...sticksOn(setup.objects[0], Array(k).fill(run(kind, 10)), 70), ...rowOf(run(kind, j), matIn(setup.objects[0]).x, matIn(setup.objects[0]).y + k * 70 + 40).map((p, i) => ({ ...p, x: p.x + i * 20 }))]), box: String(100 - n) },
      };
    }),
  T('cube-trains-for-15', 'Cube trains for a teen number', '1.NBT.B.2b', '1',
    'Build a teen number as a ten-stick in one color and a stick of the rest in another color. How many cubes are in the second stick?',
    'The ten-plus split is the teen number structure. Other splits are valid but the ten split is the most useful.',
    R => {
      const n = R.int(11, 19), [a, b] = colors(R, 2);
      const setup = cubesBoard();
      return {
        prompt: `Build ${n} as two sticks: a ten-stick of ${name(a)} cubes and a stick of ${name(b)} cubes for the rest. How many ${name(b)} cubes are there? ${n} = 10 + ?`,
        setup, answer: { board: [{ t: 'bars', bars: [{ kind: a, n: 10 }, { kind: b, n: n - 10 }], say: `Make a stick of 10 ${name(a)} cubes and a stick of ${name(b)} cubes for the rest.` }], box: { key: String(n - 10), label: `${name(b)} cubes` } },
        hints: [`Make the ten-stick first: 10 ${name(a)} cubes.`, `Count on from 10 with ${name(b)} cubes until you reach ${n}, in a new stick.`, `${n} = 10 + ${n - 10}.`],
        explain: `${n} is 1 ten and ${plural(n - 10, 'one')}: 10 + ${n - 10} = ${n}.`,
        solution: { board: solvedWith(setup, sticksOn(setup.objects[0], [run(a, 10), run(b, n - 10)])), box: String(n - 10) },
      };
    }),
  T('volume-by-cubes', 'Volume by cubes', '5.MD.C.4', '5',
    'Build one layer of a box shape as an array of cubes. How many cubes fill the box, counting layer by layer?',
    'Layer counting introduces volume as repeated area. Children should say 6 per layer, 2 layers, 12 in total.',
    R => {
      const l = R.int(2, 6), w = R.int(2, 4), h = R.int(2, 5), k = R.pick(KINDS);
      const setup = cubesBoard();
      return {
        prompt: `A box is ${l} cubes long, ${w} cubes wide and ${h} cubes tall. Build one layer: an array ${l} long and ${w} wide. How many cubes fill the whole box?`,
        setup, answer: { board: [{ t: 'rect', r: w, c: l, say: `Build one layer: ${w} rows of ${l} cubes, no gaps.` }], box: { key: String(l * w * h), label: 'cubes' } },
        hints: [`One layer is ${w} rows of ${l}: ${l * w} cubes.`, `The box is ${h} layers tall. How many cubes in ${h} layers of ${l * w}?`, `${l * w} × ${h} = ${l * w * h}.`],
        explain: `${l} × ${w} = ${l * w} cubes in a layer, and ${h} layers make ${l * w} × ${h} = ${l * w * h} cubes.`,
        solution: { board: solvedWith(setup, Array.from({ length: w }, (_, i) => rowOf(run(k, l), matIn(setup.objects[0]).x, matIn(setup.objects[0]).y + i * 40)).flat()), box: String(l * w * h) },
      };
    }),
  T('symmetry-tower', 'Symmetry tower', '4.G.A.3', '4',
    'Half a stick is built. Build its mirror image so the whole stick is symmetric. Where is the mirror line?',
    'Building the mirror image cube by cube makes symmetry a construction task, not just a spotting task.',
    R => {
      const k = R.int(3, 5), ks = colors(R, 3), pattern = Array.from({ length: k }, () => R.pick(ks));
      if (new Set(pattern).size < 2) pattern[k - 1] = ks.find(x => x !== pattern[0]);
      const setup = cubesBoard([{ w: 900, h: 200 }], os => rowOf(pattern, matIn(os[0]).x + 40, matIn(os[0]).y + 40, true));
      const opts = R.shuffle([`Between cube ${k} and cube ${k + 1}`, `Between cube ${k - 1} and cube ${k}`, `After cube ${2 * k}`]), correct = opts.indexOf(`Between cube ${k} and cube ${k + 1}`);
      const last = setup.pieces[k - 1];
      return {
        prompt: `The locked stick is half of a symmetric stick: ${pattern.map(name).join(', ')}. Join ${k} cubes to its right end so the whole stick reads the same from both ends. Where is the mirror line?`,
        setup, answer: { board: [{ t: 'mirror', pattern, say: `Join ${k} cubes to the right end: the colors in the opposite order.` }], choice: { options: opts, correct, say: 'The mirror line is where the two halves meet.' } },
        hints: [`The cube next to the end matches the last cube: ${name(pattern[k - 1])}.`, `Then go back along the stick: ${[...pattern].reverse().map(name).join(', ')}.`, `The halves meet between cube ${k} and cube ${k + 1}: that is the mirror line.`],
        explain: `${[...pattern, ...[...pattern].reverse()].map(name).join(', ')} reads the same from both ends. The mirror line is in the middle, between cube ${k} and cube ${k + 1}.`,
        solution: { board: solvedWith(setup, rowOf([...pattern].reverse(), last.x + 40, last.y)), choice: correct },
      };
    }),
  T('estimate-then-count', 'Estimate then count', '2.NBT.A.3', '2',
    'Look at a pile of cubes and estimate how many, then snap them into tens and count exactly.',
    'Estimating before counting gives counting a purpose. Grouping in tens makes the exact count reliable.',
    R => {
      const n = R.int(23, 68), list = Array.from({ length: n }, () => R.pick(KINDS)), per = 12;
      const cells = R.shuffle(Array.from({ length: per * Math.ceil(n / per + 1) }, (_, i) => i)).slice(0, n);
      const setup = cubesBoard([{ w: 900, h: 500 }], os => list.map((k, i) => cube(k, matIn(os[0]).x + (cells[i] % per) * 70 + R.int(0, 16), matIn(os[0]).y + Math.floor(cells[i] / per) * 70 + R.int(0, 16))));
      const near = Math.round(n / 10) * 10, opts = [near - 20, near, near + 20].filter(x => x > 0);
      if (opts.length < 3) opts.push(near + 40);
      return {
        prompt: 'Look at the pile of cubes. First pick your estimate. Then snap the cubes into sticks of 10 and count exactly. How many cubes are there?', sig: String(n) + list.join(''),
        setup, answer: { choice: { options: opts.map(x => `About ${x}`), correct: opts.indexOf(near), say: 'Which estimate is closest to your count?' }, box: { key: String(n), label: 'cubes' } },
        hints: ['Drag cubes end to end to make sticks of 10.', `Count the sticks by tens, then count the loose cubes on: ${Math.floor(n / 10) * 10}, then ones.`, `${plural(Math.floor(n / 10), 'ten')} and ${plural(n % 10, 'one')}: ${n}, about ${near}.`],
        explain: `${Math.floor(n / 10)} sticks of 10 and ${n % 10} more make ${n}. The closest estimate is about ${near}.`,
        solution: { board: setup, choice: opts.indexOf(near), box: String(n) },
      };
    }),
  T('equal-groups', 'Equal groups', '3.OA.A.1', '3',
    'Make equal towers of cubes. Find the total with repeated addition and multiplication.',
    'Towers must be exactly equal or the multiplication does not apply. Checking equality is part of the task.',
    R => {
      const g = R.int(2, 6), s = R.int(2, 6), k = R.pick(KINDS);
      const setup = cubesBoard([{ w: 900, h: 460 }]);
      return {
        prompt: `Make ${g} sticks of ${s} ${name(k)} cubes each. Write the total as ${Array(g).fill(s).join(' + ')} and as ${g} × ${s}. How many cubes in all?`,
        setup, answer: { board: [{ t: 'sticks', sizes: Array(g).fill(s), say: `Make ${g} sticks, each exactly ${s} cubes.` }], box: { key: String(g * s), label: 'cubes in all' } },
        hints: ['Make each stick in its own row, and check that every stick is the same length.', `Add ${s} for each stick: ${Array.from({ length: g }, (_, i) => s * (i + 1)).join(', ')}.`, `${g} × ${s} = ${g * s}.`],
        explain: `${Array(g).fill(s).join(' + ')} = ${g} × ${s} = ${g * s}: ${g} equal groups of ${s}.`,
        solution: { board: solvedWith(setup, sticksOn(setup.objects[0], Array(g).fill(run(k, s)), 60)), box: String(g * s) },
      };
    }),
  T('cube-fractions', 'Cube fractions', '3.NF.A.1', '3',
    'Build a stick in two colors. What fraction of the stick is each color?',
    'Fraction of a length model: the stick is the whole. Keep the whole explicit in every sentence.',
    R => {
      const n = R.pick([4, 6, 8, 10, 12]), a = R.int(1, n - 1), [A, B] = colors(R, 2);
      const setup = cubesBoard();
      return {
        prompt: `Build one stick of ${n} cubes: ${a} ${name(A)} and ${n - a} ${name(B)}. What fraction of the stick is ${name(A)}?`,
        setup, answer: { board: [{ t: 'stickHas', has: { [A]: a, [B]: n - a }, say: `Make one stick: ${a} ${name(A)} and ${plural(n - a, `${name(B)} cube`)}.` }], box: { key: `${a}/${n}`, label: `fraction ${name(A)}`, say: 'The whole stick is the bottom number; the colored cubes are the top number.' } },
        hints: [`The whole stick has ${n} cubes, so each cube is 1/${n} of it.`, `${plural(a, 'cube')} ${a === 1 ? 'is' : 'are'} ${name(A)}: that is ${a} of the ${n} equal parts.`, `${a}/${n} of the stick is ${name(A)}.`],
        explain: `Each cube is 1/${n} of the stick. ${plural(a, `${name(A)} cube`)} ${a === 1 ? 'makes' : 'make'} ${a}/${n}, and the ${name(B)} make ${n - a}/${n}.`,
        solution: { board: solvedWith(setup, sticksOn(setup.objects[0], [[...run(A, a), ...run(B, n - a)]])), box: `${a}/${n}` },
      };
    }),
  T('perimeter-with-cubes', 'Perimeter with cubes', '3.MD.D.8', '3',
    'Cubes lie around the edges of a card. Count the cubes that go around, then cover the card with cubes. Around and covering are different.',
    'Around versus covering separates perimeter from area in the most physical way possible.',
    R => {
      const a = R.int(2, 4), b = R.int(2, 6), k = R.pick(KINDS.slice(0, 8)), edge = 'c9';
      const setup = cubesBoard([{ w: 640, h: 380 }], os => {
        const x0 = matIn(os[0]).x + 40, y0 = matIn(os[0]).y, out = [];
        for (let j = 1; j <= b; j++) { out.push(cube(edge, x0 + j * P, y0, true)); out.push(cube(edge, x0 + j * P, y0 + (a + 1) * P, true)); }
        for (let i = 1; i <= a; i++) { out.push(cube(edge, x0, y0 + i * P, true)); out.push(cube(edge, x0 + (b + 1) * P, y0 + i * P, true)); }
        return out;
      });
      const x0 = matIn(setup.objects[0]).x + 40, y0 = matIn(setup.objects[0]).y, box = { x: x0 + 40, y: y0 + 40, w: b * P + 6 - 6, h: a * P };
      return {
        prompt: `The black cubes lie around the edges of a card. Cover the card inside them with ${name(k)} cubes, in rows with no gaps. How many black cubes go around the card?`, sig: `${a} ${b} ${k}`,
        setup, answer: { board: [{ t: 'inside', r: a, c: b, box, say: `Cover the space inside the black cubes: ${a} rows of ${b}.` }, { t: 'counts', has: { [k]: a * b }, say: `Use ${name(k)} cubes to cover the card.` }], box: { key: String(2 * a + 2 * b), label: 'cubes around' } },
        hints: [`Count the black cubes along the top, the bottom and both sides: ${b} + ${b} + ${a} + ${a}.`, `Covering takes ${a} rows of ${b}: ${a * b} cubes. That is the area, not the perimeter.`, `${b} + ${b} + ${a} + ${a} = ${2 * a + 2 * b} cubes go around.`],
        explain: `${2 * a + 2 * b} cubes go around (the perimeter) and ${a * b} cubes cover the card (the area): two different counts.`,
        solution: { board: solvedWith(setup, Array.from({ length: a }, (_, i) => rowOf(run(k, b), x0 + P, y0 + P + i * 40)).flat()), box: String(2 * a + 2 * b) },
      };
    }),
  T('number-bond-tower', 'Number bond tower', '1.OA.A.3', '1',
    'Build one stick in three colors. Record the three parts and find how many cubes in all.',
    'Three-part bonds extend the usual two-part work and prepare for adding three numbers.',
    R => {
      const [A, B, C] = colors(R, 3), a = R.int(1, 6), b = R.int(1, 6), c = R.int(1, 6), n = a + b + c;
      const setup = cubesBoard();
      return {
        prompt: `Build one stick with ${a} ${name(A)}, ${b} ${name(B)} and ${plural(c, `${name(C)} cube`)}. How many cubes are in the stick? ${a} + ${b} + ${c} = ?`,
        setup, answer: { board: [{ t: 'stickHas', has: { [A]: a, [B]: b, [C]: c }, say: `Make one stick: ${a} ${name(A)}, ${b} ${name(B)} and ${c} ${name(C)}.` }], box: { key: String(n), label: 'cubes' } },
        hints: ['Tap the colors one after another: each cube joins the stick.', `Add two parts first: ${a} + ${b} = ${a + b}.`, `${a + b} + ${c} = ${n}.`],
        explain: `${a} + ${b} + ${c} = ${n}. You can add the parts in any order: ${b} + ${c} = ${b + c} first, then ${a} + ${b + c} = ${n}, works too.`,
        solution: { board: solvedWith(setup, sticksOn(setup.objects[0], [[...run(A, a), ...run(B, b), ...run(C, c)]])), box: String(n) },
      };
    }),
  T('scaling-a-model', 'Scaling a model', '6.RP.A.1', '6',
    'A small model is built from two colors. Build a model a few times as big with the same ratio of colors. How many cubes does it use?',
    'Scaling is informal here: the point is noticing which dimensions doubled and discussing the effect.',
    R => {
      const [A, B] = colors(R, 2); let a, b; do { a = R.int(1, 4); b = R.int(1, 4); } while (a === b);
      const k = R.int(2, 3), word = k === 2 ? 'twice' : 'three times';
      const setup = cubesBoard([{ w: 900, h: 360 }], os => rowOf([...run(A, a), ...run(B, b)], matIn(os[0]).x, matIn(os[0]).y, true));
      return {
        prompt: `The locked model has ${a} ${name(A)} and ${plural(b, `${name(B)} cube`)}. Build a model ${word} as big, with the same ratio of ${name(A)} to ${name(B)}. How many cubes does it use?`,
        setup, answer: { board: [{ t: 'counts', has: { [A]: k * a, [B]: k * b }, say: `For every ${a} ${name(A)} there ${b === 1 ? 'is' : 'are'} ${b} ${name(B)}: make ${k} groups like that.` }], box: { key: String(k * (a + b)), label: 'cubes' } },
        hints: [`The ratio is ${a} ${name(A)} to ${b} ${name(B)}. ${cap(word)} as big means ${k} groups of that.`, `${k} × ${a} = ${k * a} ${name(A)} and ${k} × ${b} = ${k * b} ${name(B)}.`, `${k * a} + ${k * b} = ${k * (a + b)} cubes.`],
        explain: `${a} : ${b} is the same ratio as ${k * a} : ${k * b}. The model uses ${k} × ${a + b} = ${k * (a + b)} cubes.`,
        solution: { board: solvedWith(setup, sticksOn(setup.objects[0], [[...run(A, k * a), ...run(B, k * b)]], 80).map(p => ({ ...p, y: p.y + 80 }))), box: String(k * (a + b)) },
      };
    }),
  T('missing-cubes', 'Missing cubes', '1.OA.D.8', '1',
    'A stick broke and you see only part of it. How many cubes are hidden? Prove it with a second stick.',
    'Hidden part problems are subtraction in context. The checking stick makes the reasoning public.',
    R => {
      const n = R.int(8, 15), k = R.int(2, n - 2), [A, B] = colors(R, 2);
      const setup = cubesBoard([{ w: 900, h: 260 }], os => rowOf(run(A, k), matIn(os[0]).x, matIn(os[0]).y, true));
      return {
        prompt: `A stick of ${n} cubes broke. You can see ${k} of them. Build the missing part as one ${name(B)} stick. How many cubes are hidden?`,
        setup, answer: { board: [{ t: 'bars', bars: [{ kind: B, n: n - k }], say: `Make one ${name(B)} stick for the missing part, so both make ${n}.` }], box: { key: String(n - k), label: 'hidden cubes' } },
        hints: [`Count on from ${k}: ${countOn(k, n)}. Add a cube for each number.`, `Put your stick next to the ${k}: together they should be ${n}.`, `${k} + ${n - k} = ${n}, so ${n - k} are hidden.`],
        explain: `${k} + ${n - k} = ${n}, so ${n} − ${k} = ${n - k} cubes are hidden.`,
        solution: { board: solvedWith(setup, sticksOn(setup.objects[0], [run(B, n - k)]).map(p => ({ ...p, y: p.y + 80 }))), box: String(n - k) },
      };
    }),
];
