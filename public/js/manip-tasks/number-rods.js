// Number rods: the tool's 17 tasks as practice (docs/manip-practice-tasks.md). As in base-ten-blocks.js: each task keeps
// its title, code, grade and notes; make(R) gives one variation; conds are this tool's board checks, read from the
// board's rods (a rod's length is its kind: r1 white to r10 orange). The rods a task gives to compare with are locked
// (a row of them is a train, end to end); a rod a student puts out is checked by how many of each length there are, on
// the whole board or on a labeled work mat ("Way 1", "Train 2": the rods whose middle is on it), and on a mat in order
// from left to right where the order is the point (3 + 5, then 5 + 3).
import { boardWith, rowPlaces, objSizeOf, countTo, endLine } from '../manip-task-kit.js';
import { allPieceDefs } from '../manip-data.js';
import { objRect, OBJ_HEAD, WORLD } from '../manip-board.js';

export const SLUG = 'number-rods';
const DEFS = Object.fromEntries(allPieceDefs(SLUG).map(d => [d.kind, d]));
export const COLOR = ['', 'white', 'red', 'light green', 'purple', 'yellow', 'dark green', 'black', 'brown', 'blue', 'orange'];
const rod = n => `${COLOR[n]} rod`;
const A = n => `${['orange'].includes(COLOR[n]) ? 'an' : 'a'} ${rod(n)}`;

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
let seq = 0;
/** A rod of length n at (x, y), as the page makes one (manip.js mkPiece). */
const piece = (n, x, y, locked = false) => { const d = DEFS[`r${n}`]; return { id: `r${(++seq).toString(36)}`, kind: d.kind, x: Math.round(x), y: Math.round(y), rot: 0, flipped: false, filled: true, locked, color: d.color, label: d.label, value: d.value, w: d.w, h: d.h }; };
/** A train: rods end to end from (x, y). */
const train = (list, x, y, locked) => { const out = []; for (const n of list) { out.push(piece(n, x, y, locked)); x += DEFS[`r${n}`].w; } return out; };
const ROW = 40;
/**
 * A board: labeled work mats in a row (mats: [{ label, w }]), and above them the locked rods to compare with (refs:
 * trains, one a row, lined up at the left; right: lined up at the right instead). With no mats, the refs sit in the
 * middle of the board. unit: the white rod's value ('1', '0.1').
 */
export function rodBoard({ mats = [], refs = [], right = false, unit = '1' } = {}) {
  const objs = mats.map((m, i) => ({ id: `m${i + 1}`, k: 'mat', s: 1, st: { label: m.label, ...(m.w ? { w: m.w } : {}) } }));
  const places = objs.length ? rowPlaces(objs.map(o => objSizeOf(SLUG, o.k, o.st))) : [];
  objs.forEach((o, i) => { o.x = places[i].x; o.y = places[i].y; });
  const len = l => l.reduce((s, n) => s + DEFS[`r${n}`].w, 0), wide = Math.max(0, ...refs.map(len));
  const x0 = objs.length ? objs[0].x : Math.round((WORLD.w - wide) / 2), y0 = objs.length ? objs[0].y - refs.length * ROW - 24 : Math.round(WORLD.h / 2 - 120);
  const pieces = refs.flatMap((l, r) => train(l, x0 + (right ? wide - len(l) : 0), y0 + r * ROW, true));
  return boardWith(SLUG, objs, pieces, { unit });
}
/** The same board with these rods put out: on: { 'Way 1': [lengths] } (end to end on that mat, in order), loose:
 *  [lengths] (in a row under the refs). The solutions. */
function solved(setup, { on = {}, loose = [] } = {}) {
  const b = JSON.parse(JSON.stringify(setup));
  for (const [label, list] of Object.entries(on)) {
    const o = b.objects.find(x => x.k === 'mat' && x.st.label === label);
    b.pieces.push(...train(list, o.x + 24, o.y + OBJ_HEAD + 40, false));
  }
  if (loose.length) {
    const lk = b.pieces.filter(p => p.locked), x = lk.length ? Math.min(...lk.map(p => p.x)) : 1500, y = lk.length ? Math.max(...lk.map(p => p.y)) + 80 : 1000;
    b.pieces.push(...train(loose, x, y, false));
  }
  return b;
}

// ---------------------------------------------------------------- the checks
const lenOf = p => { const m = /^r(\d+)$/.exec(String(p && p.kind)); return m ? +m[1] : 0; };
const rodsOf = b => ((b && Array.isArray(b.pieces)) ? b.pieces : []).filter(p => p && typeof p === 'object' && DEFS[p.kind] && !p.locked)
  .map(p => ({ n: lenOf(p), x: num(p.x), y: num(p.y), w: num(p.w, DEFS[p.kind].w), h: num(p.h, DEFS[p.kind].h) }));
const matOf = (b, label) => ((b && Array.isArray(b.objects)) ? b.objects : []).find(o => o && o.k === 'mat' && o.st && o.st.label === label) || null;
/** The unlocked rods whose middle is on the mat with this label. */
function onMat(b, label) {
  const o = matOf(b, label); if (!o) return [];
  const r = objRect(SLUG, { ...o, st: o.st || {} });
  return rodsOf(b).filter(p => { const cx = p.x + p.w / 2, cy = p.y + p.h / 2; return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h; });
}
const key = list => [...list].sort((x, y) => x - y).join(',');
const sum = l => l.reduce((s, n) => s + n, 0);
export const conds = {
  /** The rods put out (on the whole board) are exactly these lengths, in any order. */
  rods: (c, b) => key(rodsOf(b).map(p => p.n)) === key(c.has),
  /** On the mat with this label: exactly these lengths (has), or n rods (n) adding to sum (sum), or these lengths from
   *  left to right (order). */
  mat: (c, b) => {
    const ps = onMat(b, c.label), ns = ps.map(p => p.n);
    if (!ps.length) return false;
    if (c.has && key(ns) !== key(c.has)) return false;
    if (c.n && ns.length !== c.n) return false;
    if (c.sum !== undefined && sum(ns) !== c.sum) return false;
    if (c.order && [...ps].sort((p, q) => p.x - q.x).map(p => p.n).join(',') !== c.order.join(',')) return false;
    return true;
  },
  /** The rods on these mats are different trains (not the same lengths on any two). */
  differ: (c, b) => { const ks = c.labels.map(l => key(onMat(b, l).map(p => p.n))); return new Set(ks).size === ks.length; },
};

// ---------------------------------------------------------------- words
const gcd = (x, y) => (y ? gcd(y, x % y) : x);
const fr = (k, d) => { const g = gcd(k, d); return `${k / g}/${d / g}`; };
const pairsOf = n => Array.from({ length: Math.floor(n / 2) }, (_, i) => [i + 1, n - i - 1]);

// ---------------------------------------------------------------- the tasks
const T = (key2, title, ccss, grade, prompt, notes, make) => ({ key: key2, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
export const TASKS = [
  T('rod-staircase', 'Rod staircase', '1.OA.C.6', '1',
    'Pick a rod. Make two different two-rod trains that match its length exactly: Way 1 uses the rod it names, Way 2 another pair.',
    'Pairs that match a rod are its additive splits. Children find 5 = 4 + 1 = 3 + 2 by eye before any symbols.',
    R => {
      const n = R.int(4, 10), a = R.int(1, n - 1), other = pairsOf(n).find(([x, y]) => key([x, y]) !== key([a, n - a]));
      const setup = rodBoard({ mats: [{ label: 'Way 1' }, { label: 'Way 2' }], refs: [[n]] });
      return {
        prompt: `The ${rod(n)} is ${n} long. On Way 1, make a two-rod train as long as it with ${A(a)}. On Way 2, make a different two-rod train as long as it.`,
        setup, answer: { board: [
          { t: 'mat', label: 'Way 1', has: [a, n - a], say: `On Way 1, put ${A(a)} and the rod that makes ${n}.` },
          { t: 'mat', label: 'Way 2', n: 2, sum: n, say: `On Way 2, put two rods that are ${n} long together.` },
          { t: 'differ', labels: ['Way 1', 'Way 2'], say: 'Way 2 needs different rods from Way 1.' }] },
        hints: [`Put ${A(a)} on Way 1. Which rod fills the rest of the ${rod(n)}'s length?`, `${a} + ${n - a} = ${n}. For Way 2, try ${A(other[0])}.`, `${other[0]} + ${other[1]} = ${n} too: the ${rod(other[0])} and the ${rod(other[1])}.`],
        explain: `${a} + ${n - a} = ${n} and ${other[0]} + ${other[1]} = ${n}. Every pair of rods as long as the ${rod(n)} is a way to make ${n}.`,
        solution: { board: solved(setup, { on: { 'Way 1': [a, n - a], 'Way 2': other } }) },
      };
    }),
  T('trains-for-10', 'Trains for a rod', '2.OA.B.2', '2',
    'Build three different two-rod trains, each as long as the rod given. Train 1 starts with the rod it names.',
    'Trains must align at both ends. Mismatched ends are the most common error and the easiest to self-check.',
    R => {
      const n = R.int(6, 10), a = R.int(1, n - 1), rest = pairsOf(n).filter(([x, y]) => key([x, y]) !== key([a, n - a])).slice(0, 2);
      const labels = ['Train 1', 'Train 2', 'Train 3'], setup = rodBoard({ mats: labels.map(label => ({ label })), refs: [[n]] });
      return {
        prompt: `Make three different two-rod trains, each as long as the ${rod(n)} (${n}). Train 1 starts with ${A(a)}.`,
        setup, answer: { board: [
          { t: 'mat', label: 'Train 1', has: [a, n - a], say: `Train 1: ${A(a)} and the rod that makes ${n}.` },
          { t: 'mat', label: 'Train 2', n: 2, sum: n, say: `Train 2: two rods that are ${n} long together.` },
          { t: 'mat', label: 'Train 3', n: 2, sum: n, say: `Train 3: two rods that are ${n} long together.` },
          { t: 'differ', labels, say: 'Each train needs different rods.' }] },
        hints: [`Train 1: ${a} + ? = ${n}. The ${rod(n - a)} fits.`, `For the others, try ${rest.map(([x]) => A(x)).join(' and ')} first.`, `${rest.map(([x, y]) => `${x} + ${y}`).join(' and ')} also make ${n}.`],
        explain: `${a} + ${n - a}, ${rest.map(([x, y]) => `${x} + ${y}`).join(' and ')}: three number sentences for ${n}. Lined up at both ends, each train is exactly as long.`,
        solution: { board: solved(setup, { on: { 'Train 1': [a, n - a], 'Train 2': rest[0], 'Train 3': rest[1] } }) },
      };
    }),
  T('if-orange-is-1', 'If orange is 1', '3.NF.A.2', '3',
    'The orange rod is worth 1 whole. Put out the rods worth two fractions of it, and say what they are worth together.',
    'Changing the unit is the whole task. Children must measure every rod against orange, which is genuine fraction reasoning.',
    R => {
      let a, b; do { a = R.int(1, 9); b = R.int(1, 9); } while (a === b || a + b > 10);
      const F = k => (R.chance(0.5) ? fr(k, 10) : `${k}/10`), fa = F(a), fb = F(b);
      const setup = rodBoard({ refs: [[10]] });
      return {
        prompt: `The orange rod is 1 whole. Put out the rod worth ${fa} and the rod worth ${fb}. Together, what fraction of orange are they?`,
        setup, answer: { board: [{ t: 'rods', has: [a, b], say: `Put out the rod worth ${fa} and the rod worth ${fb}, and no others.` }], box: { key: `${a + b}/10`, label: 'fraction of orange' } },
        hints: ['Ten white rods make orange, so each white rod is 1/10.', `${fa} is ${a}/10: the ${rod(a)}. ${fb} is ${b}/10: the ${rod(b)}.`, `${a}/10 + ${b}/10 = ${a + b}/10.`],
        explain: `With orange as 1, the ${rod(a)} is ${a}/10 and the ${rod(b)} is ${b}/10, so together they are ${a + b}/10${gcd(a + b, 10) > 1 ? ` (${fr(a + b, 10)})` : ''}.`,
        solution: { board: solved(setup, { loose: [a, b] }), box: `${a + b}/10` },
      };
    }),
  T('difference-rods', 'Difference rods', '2.NBT.B.5', '2',
    'Two rods are lined up at the left. Find the single rod that fills the gap. What subtraction does it show?',
    'The gap rod is the difference made visible: 9 − 5 = 4, the purple rod. Difference as comparison, not just take-away.',
    R => {
      const a = R.int(3, 10), b = R.int(1, a - 1), setup = rodBoard({ refs: [[a], [b]] });
      return {
        prompt: `The ${rod(a)} (${a}) and the ${rod(b)} (${b}) are lined up at the left. Put out the one rod that fills the gap next to the ${rod(b)}. What is ${a} − ${b}?`,
        setup, answer: { board: [{ t: 'rods', has: [a - b], say: 'Put out one rod as long as the gap.' }], box: { key: String(a - b), label: `${a} − ${b}` } },
        hints: [`Look at the end of the ${rod(b)}. How much more is the ${rod(a)}?`, `Try rods in the gap until one fits exactly, end to end.`, `The ${rod(a - b)} fits: ${a} − ${b} = ${a - b}.`],
        explain: `${b} + ${a - b} = ${a}, so ${a} − ${b} = ${a - b}. The rod in the gap is the difference.`,
        solution: { board: solved(setup, { loose: [a - b] }), box: String(a - b) },
      };
    }),
  T('rod-algebra-r-w', 'Rod algebra: trains of equal rods', '3.OA.A.1', '3',
    'White is 1, so each rod is its length. Build a train of equal rods, then find the rod (or orange and one more) that matches it.',
    'Three reds match dark green 6. Repeated addition with rods is multiplication waiting for its name.',
    R => {
      let r, k; do { r = R.int(1, 9); k = R.int(2, 10); } while (k * r > 20 || (r === 1 && k < 3));
      const p = k * r, match = p > 10 ? [10, p - 10] : [p], setup = rodBoard({});
      const sumText = k <= 5 ? ` (${Array(k).fill(r).join(' + ')})` : '';
      return {
        prompt: `White is 1. Make a train of ${k} ${COLOR[r]} rods${sumText}. Then put out ${p > 10 ? 'orange and one more rod' : 'the one rod'} as long as the train. How long is it?`,
        setup, answer: { board: [{ t: 'rods', has: [...Array(k).fill(r), ...match], say: `Put out ${k} ${COLOR[r]} rods and ${p > 10 ? 'orange and the rod' : 'the rod'} that matches them.` }], box: { key: String(p), label: 'how long' } },
        hints: [`Add ${k} ${COLOR[r]} rods end to end: each is ${r}.`, `${Array(Math.min(k, 6)).fill(r).join(' + ')}${k > 6 ? ' + ...' : ''}: count on by ${r}s.`, `${k} × ${r} = ${p}: ${p > 10 ? `orange and the ${rod(p - 10)}` : `the ${rod(p)}`}.`],
        explain: `${k} rods of ${r} make ${p}: ${k} × ${r} = ${p}. A train of equal rods is multiplication.`,
        solution: { board: solved(setup, { loose: [...Array(k).fill(r), ...match] }), box: String(p) },
      };
    }),
  T('measure-the-gap', 'Measure the gap', '2.MD.A.1', '2',
    'A train of two rods is longer than the orange rod. Find the rod that measures the overshoot exactly.',
    'Overshoot is a difference measured in rods. Exact fit is the success test, estimation is not enough.',
    R => {
      let a, b; do { a = R.int(2, 9); b = R.int(2, 9); } while (a + b <= 10);
      const s = a + b, setup = rodBoard({ refs: [[a, b], [10]] });
      return {
        prompt: `The train of ${A(a)} and ${A(b)} is longer than the orange rod under it. Put out the one rod that fills the gap at the end of orange. How much longer is the train?`,
        setup, answer: { board: [{ t: 'rods', has: [s - 10], say: 'Put out one rod as long as the gap.' }], box: { key: String(s - 10), label: 'how much longer' } },
        hints: [`The train is ${a} + ${b} = ${s} long. Orange is 10.`, `Try rods at the end of orange until one fits exactly.`, `${s} − 10 = ${s - 10}: the ${rod(s - 10)}.`],
        explain: `${a} + ${b} = ${s}, and ${s} − 10 = ${s - 10}. The rod that fills the gap measures how much longer the train is.`,
        solution: { board: solved(setup, { loose: [s - 10] }), box: String(s - 10) },
      };
    }),
  T('fraction-of-a-rod', 'Fraction of a rod', '3.NF.A.2', '3',
    'One rod is 1 whole. Put out the rods that are two given fractions of it.',
    'Halving repeatedly: brown 8, purple 4, red 2, white 1. The chain shows unit fractions nested inside each other.',
    R => {
      const W = R.pick([4, 6, 8, 8, 9]), fs = [];
      for (let k = 1; k < W; k++) { const g = gcd(k, W), d = W / g; if ([2, 3, 4, 6, 8].includes(d)) fs.push(k); }
      const [x, y] = R.shuffle(fs).slice(0, 2), setup = rodBoard({ refs: [[W]] });
      return {
        prompt: `The ${rod(W)} is 1 whole. Put out the rod that is ${fr(x, W)} of it and the rod that is ${fr(y, W)} of it.`,
        setup, answer: { board: [{ t: 'rods', has: [x, y], say: `Put out the rod for ${fr(x, W)} and the rod for ${fr(y, W)}, and no others.` }] },
        hints: [`The ${rod(W)} is ${W} white rods long, so one white rod is 1/${W}.`, `${fr(x, W)} of ${W} is ${x}, and ${fr(y, W)} of ${W} is ${y}.`, `Put out the ${rod(x)} and the ${rod(y)}.`],
        explain: `${fr(x, W)} of the ${rod(W)} is ${x} long (the ${rod(x)}), and ${fr(y, W)} is ${y} long (the ${rod(y)}). Lay them beside it to check.`,
        solution: { board: solved(setup, { loose: [x, y] }) },
      };
    }),
  T('rod-equations', 'Rod equations', '1.OA.D.7', '1',
    'Build both sides of an equation with rods. Are they the same length? Pick True or False.',
    'Equal lengths are equal values. Children should slide a ruler along both ends to verify before writing equals.',
    R => {
      let a, b, c, d, ok;
      do {
        a = R.int(1, 7); b = R.int(1, 8 - a); ok = R.chance(0.5); c = R.int(1, 8);
        d = (ok ? a + b : a + b + R.pick([-1, 1])) - c;
      } while (d < 1 || d > 9 || c + d > 10 || key([a, b]) === key([c, d]));
      const setup = rodBoard({ mats: [{ label: 'Left' }, { label: 'Right' }] }), options = ['True: both sides are the same length', 'False: the sides are different lengths'];
      return {
        prompt: `Is ${a} + ${b} = ${c} + ${d} true? Build ${a} + ${b} on Left and ${c} + ${d} on Right. Then pick.`,
        setup, answer: { board: [
          { t: 'mat', label: 'Left', has: [a, b], say: `On Left, put the ${rod(a)} and the ${rod(b)}.` },
          { t: 'mat', label: 'Right', has: [c, d], say: `On Right, put the ${rod(c)} and the ${rod(d)}.` }],
        choice: { options, correct: ok ? 0 : 1, say: 'Line up the two trains at the left. Do they end at the same place?' } },
        hints: [`Left: the ${rod(a)} and the ${rod(b)}. Right: the ${rod(c)} and the ${rod(d)}.`, 'Line the trains up at the left and look at the right ends.', ok ? `Both are ${a + b} long, so it is true.` : `${a} + ${b} = ${a + b} but ${c} + ${d} = ${c + d}, so it is false.`],
        explain: ok ? `${a} + ${b} = ${a + b} and ${c} + ${d} = ${a + b}: the same length, so the equation is true.` : `${a} + ${b} = ${a + b} but ${c} + ${d} = ${c + d}. The trains are different lengths, so the equation is false.`,
        solution: { board: solved(setup, { on: { Left: [a, b], Right: [c, d] } }), choice: ok ? 0 : 1 },
      };
    }),
  T('decimals-with-orange-as-1', 'Decimals with orange as 1', '5.NBT.A.3', '5',
    'Let orange be 1, so white is 0.1. Put out the rods worth two decimals and type the greater value.',
    'Each unit is a tenth when orange is the whole, so values run 0.1 to 1.0 in rod order. The staircase becomes a decimal scale.',
    R => {
      const [a, b] = R.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2), big = Math.max(a, b), setup = rodBoard({ refs: [[10]], unit: '0.1' });
      return {
        prompt: `Orange is 1, so white is 0.1. Put out the rods worth 0.${a} and 0.${b}. Which is worth more? Type its value.`,
        setup, answer: { board: [{ t: 'rods', has: [a, b], say: `Put out the rod worth 0.${a} and the rod worth 0.${b}, and no others.` }], box: { key: `0.${big}`, label: 'the greater value' } },
        hints: ['Each rod is worth 0.1 for every white rod it is long.', `0.${a} is the ${rod(a)} and 0.${b} is the ${rod(b)}.`, `The ${rod(big)} is longer, so 0.${big} is worth more.`],
        explain: `0.${big} > 0.${Math.min(a, b)}: the longer rod is worth more tenths.`,
        solution: { board: solved(setup, { loose: [a, b] }), box: `0.${big}` },
      };
    }),
  T('commutative-trains', 'Commutative trains', '1.OA.B.3', '1',
    'Build the same two rods in both orders, one train on each mat. What stays the same?',
    'Order changes, length does not. That observation is commutativity, earned by building rather than told.',
    R => {
      let a, b; do { a = R.int(1, 9); b = R.int(1, 9); } while (a === b || a + b > 10);
      const setup = rodBoard({ mats: [{ label: 'First' }, { label: 'Second' }] });
      return {
        prompt: `On First, build ${a} + ${b}: the ${rod(a)}, then the ${rod(b)}. On Second, build ${b} + ${a}. How long is each train?`,
        setup, answer: { board: [
          { t: 'mat', label: 'First', order: [a, b], say: `On First, put the ${rod(a)} first, then the ${rod(b)}.` },
          { t: 'mat', label: 'Second', order: [b, a], say: `On Second, put the ${rod(b)} first, then the ${rod(a)}.` }], box: { key: String(a + b), label: 'how long' } },
        hints: [`First: the ${rod(a)} on the left, the ${rod(b)} right after it.`, `Second: the ${rod(b)} on the left, then the ${rod(a)}.`, `Both trains are ${a + b} long: ${a} + ${b} = ${b} + ${a} = ${a + b}.`],
        explain: `${a} + ${b} = ${b} + ${a} = ${a + b}. The order changed, the length did not.`,
        solution: { board: solved(setup, { on: { First: [a, b], Second: [b, a] } }), box: String(a + b) },
      };
    }),
  T('rod-word-problem', 'Rod word problem', '2.OA.A.1', '2',
    'Two ribbons are each two rods long. Build both and say if they are the same length.',
    'Both total 12. Comparing sums through lengths gives children a checking strategy for word problems.',
    R => {
      let a, b, c, d, s1, s2;
      do { a = R.int(5, 10); b = R.int(1, 9); c = R.int(5, 10); d = R.int(1, 9); s1 = a + b; s2 = c + d; } while (s1 <= 10 || s2 <= 10 || key([a, b]) === key([c, d]) || Math.abs(s1 - s2) > 2 || (R.chance(0.4) && s1 !== s2));
      const options = ['They are the same length', 'Ribbon 1 is longer', 'Ribbon 2 is longer'], correct = s1 === s2 ? 0 : s1 > s2 ? 1 : 2;
      const setup = rodBoard({ mats: [{ label: 'Ribbon 1', w: 700 }, { label: 'Ribbon 2', w: 700 }] });
      return {
        prompt: `Ribbon 1 is ${A(a)} and ${A(b)} long. Ribbon 2 is ${A(c)} and ${A(d)} long. Build each ribbon on its mat. Are they the same length?`,
        setup, answer: { board: [
          { t: 'mat', label: 'Ribbon 1', has: [a, b], say: `On Ribbon 1, put the ${rod(a)} and the ${rod(b)}.` },
          { t: 'mat', label: 'Ribbon 2', has: [c, d], say: `On Ribbon 2, put the ${rod(c)} and the ${rod(d)}.` }],
        choice: { options, correct, say: 'Add each ribbon\'s two rods, or line them up and look.' } },
        hints: [`Ribbon 1 is ${a} + ${b}. Ribbon 2 is ${c} + ${d}.`, 'Line up both ribbons at the left and compare the right ends.', `${a} + ${b} = ${s1} and ${c} + ${d} = ${s2}.`],
        explain: s1 === s2 ? `${a} + ${b} = ${c} + ${d} = ${s1}: the same length.` : `${a} + ${b} = ${s1} and ${c} + ${d} = ${s2}, so Ribbon ${s1 > s2 ? 1 : 2} is longer by ${Math.abs(s1 - s2)}.`,
        solution: { board: solved(setup, { on: { 'Ribbon 1': [a, b], 'Ribbon 2': [c, d] } }), choice: correct },
      };
    }),
  T('square-numbers-with-rods', 'Square numbers with rods', '3.MD.C.7b', '3',
    'Build a square or rectangle by stacking equal rods. How many white rods would fill it?',
    'Areas 4, 9, 16 in unit rods. Building squares from rods links length multiplication to area.',
    R => {
      let a, b; do { a = R.int(2, 10); b = R.int(2, 10); } while (Math.abs(a - b) > 2);
      const setup = rodBoard({});
      return {
        prompt: `Build a ${a} by ${b} ${a === b ? 'square' : 'rectangle'}: stack ${b} ${COLOR[a]} rods. How many white rods would fill it?`,
        setup, answer: { board: [{ t: 'rods', has: Array(b).fill(a), say: `Put out ${b} ${COLOR[a]} rods, and no others.` }], box: { key: String(a * b), label: 'white rods' } },
        hints: [`Each ${rod(a)} is ${a} white rods long.`, `${b} rows of ${a} white rods: count ${endLine(countTo(b, a, null))}`, `${b} × ${a} = ${a * b}.`],
        explain: `${b} rows of ${a} make ${a * b} squares: ${b} × ${a} = ${a * b}${a === b ? `, a square number` : ''}.`,
        solution: { board: solved(setup, { loose: Array(b).fill(a) }), box: String(a * b) },
      };
    }),
  T('missing-rod', 'Missing rod', '2.OA.B.2', '2',
    'A train of one rod and a mystery rod is as long as a longer rod. Find the mystery rod.',
    'The mystery rod is 4, purple, because 9 - 5 = 4. Hiding creates a genuine need to subtract.',
    R => {
      const t = R.int(3, 10), a = R.int(1, t - 1), setup = rodBoard({ refs: [[t], [a]] });
      return {
        prompt: `A train of ${A(a)} and a mystery rod is as long as the ${rod(t)} (${t}). Put out the mystery rod. What is it worth?`,
        setup, answer: { board: [{ t: 'rods', has: [t - a], say: 'Put out one rod: the mystery rod.' }], box: { key: String(t - a), label: 'the mystery rod' } },
        hints: [`${a} + ? = ${t}.`, `Count on from ${a} to ${t}, or try rods after the ${rod(a)}.`, `${t} − ${a} = ${t - a}: the ${rod(t - a)}.`],
        explain: `${a} + ${t - a} = ${t}, so the mystery rod is ${t - a}, the ${rod(t - a)}.`,
        solution: { board: solved(setup, { loose: [t - a] }), box: String(t - a) },
      };
    }),
  T('ratio-rods', 'Ratio rods', '6.RP.A.1', '6',
    'Two rods make a pair. Build the same relationship a few times longer, one train for each rod. How long is the second train?',
    'Scaling 2 to 3 gives 6 to 9, dark green to blue. Length ratios stay honest when both rods scale together.',
    R => {
      let a, b; do { a = R.int(1, 5); b = R.int(1, 5); } while (a === b);
      const k = R.int(2, 3), setup = rodBoard({ mats: [{ label: 'First', w: 560 }, { label: 'Second', w: 560 }], refs: [[a], [b]] });
      return {
        prompt: `The ${rod(a)} (${a}) and the ${rod(b)} (${b}) are a pair. On First, build a train ${k} times as long as the ${rod(a)}. On Second, one ${k} times as long as the ${rod(b)}. How long is the Second train?`,
        setup, answer: { board: [
          { t: 'mat', label: 'First', sum: k * a, say: `First should be ${k} × ${a} long.` },
          { t: 'mat', label: 'Second', sum: k * b, say: `Second should be ${k} × ${b} long.` }], box: { key: String(k * b), label: 'the Second train' } },
        hints: [`Put ${k} ${COLOR[a]} rods on First and ${k} ${COLOR[b]} rods on Second.`, `First is ${k} × ${a} = ${k * a}. Second is ${k} × ${b}.`, `${a} to ${b} becomes ${k * a} to ${k * b}. The Second train is ${k * b} long.`],
        explain: `${a} : ${b} is the same ratio as ${k * a} : ${k * b}: both rods got ${k} times as long.`,
        solution: { board: solved(setup, { on: { First: Array(k).fill(a), Second: Array(k).fill(b) } }), box: String(k * b) },
      };
    }),
  T('rod-perimeter', 'Rod perimeter', '3.MD.D.8', '3',
    'Make a rectangle from two pairs of rods. What is its perimeter in white-rod units?',
    'Perimeter is 10 + 5 + 10 + 5 = 30 units. Traveling around the shape with rods makes perimeter a journey.',
    R => {
      let a, b; do { a = R.int(2, 10); b = R.int(2, 10); } while (a === b);
      const setup = rodBoard({});
      return {
        prompt: `Put out two ${COLOR[a]} rods and two ${COLOR[b]} rods, and make a rectangle with them. What is its perimeter in white-rod units?`,
        setup, answer: { board: [{ t: 'rods', has: [a, a, b, b], say: `Put out two ${COLOR[a]} rods and two ${COLOR[b]} rods, and no others.` }], box: { key: String(2 * a + 2 * b), label: 'perimeter' } },
        hints: [`The rectangle's sides are ${a}, ${b}, ${a} and ${b}.`, 'The perimeter is the way all around: add all four sides.', `${a} + ${b} + ${a} + ${b} = ${2 * a + 2 * b}.`],
        explain: `${a} + ${b} + ${a} + ${b} = ${2 * a + 2 * b} white-rod units all the way around.`,
        solution: { board: solved(setup, { loose: [a, a, b, b] }), box: String(2 * a + 2 * b) },
      };
    }),
  T('negative-steps', 'Negative steps', '2.NBT.B.5', '2',
    'Start at the end of a train. Step back the length of a rod. Put out the rod that shows where you land.',
    'Landing at 1 shows 10 - 9. Large steps back are less scary when the landing rod is visible.',
    R => {
      let s, b; do { s = R.int(5, 19); b = R.int(2, 9); } while (s - b < 1 || s - b > 10);
      const start = s > 10 ? [10, s - 10] : [s], setup = rodBoard({ refs: [start, [b]], right: true });
      return {
        prompt: `The train is ${s} long. Step back ${A(b)} (${b}) from its end, as shown. Put out the one rod that shows where you land. What is ${s} − ${b}?`,
        setup, answer: { board: [{ t: 'rods', has: [s - b], say: 'Put out one rod from the start to where you land.' }], box: { key: String(s - b), label: `${s} − ${b}` } },
        hints: [`The ${rod(b)} is lined up with the end of the train.`, 'Which rod fills the train from its start to the start of the step back?', `${s} − ${b} = ${s - b}: the ${rod(s - b)}.`],
        explain: `${s} − ${b} = ${s - b}. Stepping back ${b} from ${s} lands on ${s - b}, the length of the ${rod(s - b)}.`,
        solution: { board: solved(setup, { loose: [s - b] }), box: String(s - b) },
      };
    }),
  T('equivalence-trains', 'Equivalence trains', '1.OA.C.6', '1',
    'Find two different two-rod trains that both match a rod. Then check a third train: does it match too?',
    '7 splits as 6 + 1, 5 + 2, 4 + 3. Listing all splits systematically is early algebraic completeness.',
    R => {
      const n = R.int(5, 10), ps = R.shuffle(pairsOf(n)).slice(0, 2), yes = R.chance(0.5);
      let c, d; do { c = R.int(1, 9); d = yes ? n - c : n + R.pick([-1, 1]) - c; } while (d < 1 || d > 9);
      const setup = rodBoard({ mats: [{ label: 'Train 1' }, { label: 'Train 2' }], refs: [[n]] }), options = ['Yes', 'No'];
      return {
        prompt: `Make two different two-rod trains as long as the ${rod(n)} (${n}): one on Train 1, one on Train 2. Is ${c} + ${d} as long as the ${rod(n)} too?`,
        setup, answer: { board: [
          { t: 'mat', label: 'Train 1', n: 2, sum: n, say: `On Train 1, put two rods that are ${n} long together.` },
          { t: 'mat', label: 'Train 2', n: 2, sum: n, say: `On Train 2, put two rods that are ${n} long together.` },
          { t: 'differ', labels: ['Train 1', 'Train 2'], say: 'Train 2 needs different rods from Train 1.' }],
        choice: { options, correct: yes ? 0 : 1, say: `Does ${c} + ${d} make ${n}?` } },
        hints: [`Try ${ps[0][0]} + ${ps[0][1]} on Train 1.`, `Then ${ps[1][0]} + ${ps[1][1]} on Train 2.`, `${c} + ${d} = ${c + d}, so ${yes ? 'yes, it matches' : `no, ${n} is needed`}.`],
        explain: `${ps[0][0]} + ${ps[0][1]} = ${ps[1][0]} + ${ps[1][1]} = ${n}. ${c} + ${d} = ${c + d}${yes ? ', another train for ' + n : `, not ${n}`}.`,
        solution: { board: solved(setup, { on: { 'Train 1': ps[0], 'Train 2': ps[1] } }), choice: yes ? 0 : 1 },
      };
    }),
];
