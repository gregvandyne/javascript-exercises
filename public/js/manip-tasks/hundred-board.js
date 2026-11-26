// Hundred Board: the tool's 17 tasks as practice (docs/manip-practice-tasks.md). As in rekenreks.js: each task keeps
// its title, code, grade and notes; make(R) gives one variation; conds are this tool's board checks, read from the
// board's hundred board object (its start, tenths or whole numbers, the cells covered with a star, and which
// Multiples of shading is on). Every variation hides the board's totals (the handle bar's "Covered 47 · 1 more 48 ·
// 10 more 57" would give answers away).
import { boardWith, rowPlaces, objSizeOf, plural } from '../manip-task-kit.js';

export const SLUG = 'hundred-board';

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
/** A cell's value on a board ({ start, decimalMode }). */
const valueAt = (st, i) => (st.decimalMode ? Math.round(num(st.start, 1) + i) / 10 : num(st.start, 1) + i);
/** A value's cell (index 0-99) on a board, or -1. */
export const cellOf = (st, v) => { const i = st.decimalMode ? Math.round(v * 10) - num(st.start, 1) : Math.round(v) - num(st.start, 1); return i >= 0 && i < 100 ? i : -1; };
/** A board with one hundred board: { start, covered (values), hidden, decimalMode, mult }. */
export function hbBoard({ start = 1, covered = [], hidden = false, decimalMode = false, mult = 0 } = {}) {
  const st = { start, picked: [], mult, decimalMode, hidden };
  st.picked = covered.map(v => cellOf(st, v));
  const [at] = rowPlaces([objSizeOf(SLUG, SLUG, st)]);
  return boardWith(SLUG, [{ id: 'h1', k: SLUG, x: at.x, y: at.y, s: 1, locked: true, st }]);
}
/** The same board with these values covered too (the solutions). */
const solved = (setup, more, st2 = {}) => { const b = JSON.parse(JSON.stringify(setup)), st = b.objects[0].st; Object.assign(st, st2); st.picked = [...new Set([...st.picked, ...more.map(v => cellOf(st, v))])]; return b; };

// ---------------------------------------------------------------- the checks
/** The board's hundred board as the checks read it: { start, decimalMode, mult, covered (values, sorted) } | null. */
function hbOf(b) {
  const o = ((b && Array.isArray(b.objects)) ? b.objects : []).find(x => x && x.k === SLUG && x.st && typeof x.st === 'object'); if (!o) return null;
  const st = { start: num(o.st.start, 1) || 1, decimalMode: !!o.st.decimalMode, mult: num(o.st.mult, 0) };
  const idx = [...new Set((Array.isArray(o.st.picked) ? o.st.picked : []).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < 100))];
  return { ...st, covered: idx.map(i => valueAt(st, i)).sort((x, y) => x - y) };
}
const sameVals = (a, b) => a.length === b.length && [...b].sort((x, y) => x - y).every((v, i) => Math.abs(a[i] - v) < 1e-6);
export const conds = {
  /** Exactly these numbers are covered (stars), nothing else. */
  covered: (c, b) => { const h = hbOf(b); return !!h && sameVals(h.covered, c.vals); },
  /** The Multiples of m shading is on. */
  mult: (c, b) => { const h = hbOf(b); return !!h && !h.decimalMode && h.mult === c.m; },
};

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
const d1 = v => (Math.round(v * 10) / 10).toFixed(1);
const nth = k => `${k}${k % 100 >= 11 && k % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][k % 10] || 'th'}`;
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
/** A two-digit number whose four neighbors are all on the board (not at a row's end, not in the top or bottom row). */
const inner = R => { let n; do { n = R.int(12, 89); } while (n % 10 === 0 || n % 10 === 1); return n; };
const MOVES = { left: [-1, 'left of'], right: [1, 'right of'], above: [-10, 'above'], below: [10, 'below'] };
export const TASKS = [
  T('10-more-10-less', '1 or 10 more or less', '1.NBT.C.5', '1',
    'The numbers are hidden and one number is covered. Cover the number that is 1 more, 1 less, 10 more or 10 less, without seeing the numbers.',
    'Moving down a row adds 10, the board\'s key structure. If a child counts on their fingers for 10 more, point at the column pattern.',
    R => {
      const op = R.pick([['10 more', 10], ['10 less', -10], ['1 more', 1], ['1 less', -1]]); let n, t;
      // (1 more or less stays in the same row: the next cell over)
      do { n = R.int(11, 90); t = n + op[1]; } while (t < 1 || t > 100 || (Math.abs(op[1]) === 1 && Math.ceil(n / 10) !== Math.ceil(t / 10)));
      const setup = hbBoard({ covered: [n], hidden: true });
      return {
        prompt: `The numbers are hidden. The star covers ${n}. Cover the number that is ${op[0]} than ${n}. What number is it?`,
        setup, answer: { board: [{ t: 'covered', vals: [n, t], say: `Keep ${n} covered and cover the number ${op[0]}.` }], box: { key: String(t), label: `${op[0]} than ${n}` } },
        hints: [Math.abs(op[1]) === 10 ? `${op[1] > 0 ? 'Down' : 'Up'} one row is ${op[0]}.` : `One cell to the ${op[1] > 0 ? 'right' : 'left'} is ${op[0]}.`, `Tap that cell next to the star${Math.abs(op[1]) === 10 ? `, in the same column` : ''}.`, `${n} ${op[1] > 0 ? '+' : '−'} ${Math.abs(op[1])} = ${t}.`],
        explain: `${n} ${op[1] > 0 ? '+' : '−'} ${Math.abs(op[1])} = ${t}. On the board, 10 more or less is one row down or up; 1 more or less is one cell right or left.`,
        solution: { board: solved(setup, [t]), box: String(t) },
      };
    }),
  T('multiples-of-6-pattern', 'Multiples pattern', '3.OA.D.9', '3',
    'Turn on the shading for multiples of a number. Use the pattern to find and cover one of its multiples.',
    'The diagonal drift surprises children. Link it to 6 being 10 − 4, or to two columns of 3s combining.',
    R => {
      const m = R.int(3, 9), k = R.int(2, Math.min(12, Math.floor(100 / m))), t = m * k, setup = hbBoard();
      return {
        prompt: `Tap Multiples of ${m} to shade them. Count along the shaded numbers to the ${nth(k)} one and cover it. What is ${m} × ${k}?`,
        setup, answer: { board: [{ t: 'mult', m, say: `Turn on Multiples of ${m} in the palette.` }, { t: 'covered', vals: [t], say: `Cover the ${nth(k)} shaded number, and only that one.` }], box: { key: String(t), label: `${m} × ${k}` } },
        hints: [`Each shaded number is ${m} more than the one before: ${m}, ${2 * m}, ${3 * m}...`, `Count ${k} shaded numbers. ${k > 10 ? `The 10th is ${10 * m}; keep going from there.` : ''}`.trim(), `${m} × ${k} = ${t}.`],
        explain: `${m} × ${k} = ${t}. The multiples of ${m} make a pattern on the board because each one is ${m} more than the last.`,
        solution: { board: solved(setup, [t], { mult: m }), box: String(t) },
      };
    }),
  T('round-and-check', 'Round and check', '3.NBT.A.1', '3',
    'Cover a number, round it to the nearest 10, and cover that ten too. Use the board to prove your answer is right.',
    '68 sits 2 away from 70 and 8 away from 60. Counting the steps on the board makes the halfway rule concrete.',
    R => {
      let n; do { n = R.int(11, 99); } while (n % 10 === 0 || n % 10 === 5);
      const r = Math.round(n / 10) * 10, lo = Math.floor(n / 10) * 10, setup = hbBoard();
      return {
        prompt: `Cover ${n}. Round ${n} to the nearest ten and cover that ten too. What is ${n} rounded to the nearest ten?`,
        setup, answer: { board: [{ t: 'covered', vals: [n, r], say: `Cover ${n} and the ten it is closest to.` }], box: { key: String(r), label: 'rounded' } },
        hints: [`${n} is between ${lo} and ${lo + 10}.`, `Count the steps from ${n} to ${lo}, then to ${lo + 10}.`, `${n} is ${Math.abs(n - r)} away from ${r}: it rounds to ${r}.`],
        explain: `${n} is ${n - lo} away from ${lo} and ${lo + 10 - n} away from ${lo + 10}, so it rounds to ${r}.`,
        solution: { board: solved(setup, [n, r]), box: String(r) },
      };
    }),
  T('decimal-slide', 'Decimal slide', '5.NBT.A.3', '5',
    'The board shows tenths. Cover a number, then cover the number 0.1 more or 1 more.',
    'The board structure is identical, only the unit changed. Children who own the whole-number board transfer the pattern instantly.',
    R => {
      const step = R.pick([0.1, 1]); let x;
      do { x = R.int(1, 90) / 10; } while ((step === 0.1 && Math.round(x * 10) % 10 === 0) || x + step > 10);
      const t = Math.round((x + step) * 10) / 10, setup = hbBoard({ decimalMode: true });
      return {
        prompt: `The board shows tenths, from 0.1 to 10.0. Cover ${d1(x)}. Then cover the number that is ${step === 1 ? '1' : '0.1'} more. What is it?`,
        setup, answer: { board: [{ t: 'covered', vals: [x, t], say: `Cover ${d1(x)} and the number ${step === 1 ? '1' : '0.1'} more.` }], box: { key: d1(t), label: `${step === 1 ? '1' : '0.1'} more` } },
        hints: [step === 1 ? 'Each row holds ten tenths, which is 1 whole. One row down is 1 more.' : 'Each cell is one tenth. One cell to the right is 0.1 more.', step === 1 ? `Go straight down one row from ${d1(x)}.` : `Move one cell right from ${d1(x)}.`, `${d1(x)} + ${step === 1 ? '1' : '0.1'} = ${d1(t)}.`],
        explain: `${d1(x)} + ${step === 1 ? '1' : '0.1'} = ${d1(t)}. With tenths, a cell is 0.1 and a row is 1, just as a cell is 1 and a row is 10 with whole numbers.`,
        solution: { board: solved(setup, [x, t]), box: d1(t) },
      };
    }),
  T('skip-count-by-3s', 'Skip count on the board', '2.NBT.A.2', '2',
    'Skip count on the board: cover each number you say, then say the number that comes next.',
    'The board shows why the pattern drifts diagonally: 3 does not divide 10, so each row shifts.',
    R => {
      const m = R.pick([2, 3, 4, 5, 10]), c = R.int(4, Math.min(10, Math.floor(90 / m))), vals = Array.from({ length: c }, (_, i) => m * (i + 1)), setup = hbBoard();
      return {
        prompt: `Skip count by ${m}s from ${m} to ${m * c}: cover each number you say. What number comes next?`,
        setup, answer: { board: [{ t: 'covered', vals, say: `Cover ${vals.slice(0, 3).join(', ')}... up to ${m * c}, and nothing else.` }], box: { key: String(m * (c + 1)), label: 'comes next' } },
        hints: [`Start at ${m} and jump ${m} each time: ${vals.slice(0, 3).join(', ')}...`, `You stop at ${m * c}. Jump ${m} more.`, `${m * c} + ${m} = ${m * (c + 1)}.`],
        explain: `Counting by ${m}s: ${vals.join(', ')}, ${m * (c + 1)}. Each number is ${m} more than the one before.`,
        solution: { board: solved(setup, vals), box: String(m * (c + 1)) },
      };
    }),
  T('prime-hunt-intro', 'Prime hunt intro', '4.OA.B.4', '4',
    'Cover every multiple of 2, 3 and 5 (but not 2, 3 and 5 themselves) up to a number. How many numbers from 2 up stay uncovered?',
    'This is a gentle sieve. Uncovered numbers include primes and 1, which sparks a good discussion about what prime means.',
    R => {
      const N = R.int(20, 48), vals = []; for (let x = 4; x <= N; x++) if (x % 2 === 0 || x % 3 === 0 || x % 5 === 0) vals.push(x);
      const left = []; for (let x = 2; x <= N; x++) if (!vals.includes(x)) left.push(x);
      const setup = hbBoard();
      return {
        prompt: `Cover every number from 4 to ${N} that is a multiple of 2, 3 or 5. Leave 2, 3 and 5 uncovered. How many numbers from 2 to ${N} are not covered?`,
        setup, answer: { board: [{ t: 'covered', vals, say: `Cover every multiple of 2, 3 or 5 from 4 to ${N}, and nothing else.` }], box: { key: String(left.length), label: 'not covered' } },
        hints: ['Cover the even numbers from 4 first, then the multiples of 3 from 6, then of 5 from 10.', `Now count the numbers from 2 to ${N} with no star.`, `${left.join(', ')}: ${left.length} numbers.`],
        explain: `${left.join(', ')} are left. Each one has only 1 and itself as factors: they are the prime numbers up to ${N}.`,
        solution: { board: solved(setup, vals), box: String(left.length) },
      };
    }),
  T('add-9-trick', 'Add or subtract 9 or 11', '2.NBT.B.5', '2',
    'Cover a number. Add or subtract 9 or 11 by moving one row and then one cell. Cover where you land.',
    'Adding 10 then subtracting 1 is the strategy; the board move makes it unforgettable.',
    R => {
      const [d, a, b] = R.pick([[9, 'down one row', 'back one cell'], [11, 'down one row', 'forward one cell'], [-9, 'up one row', 'forward one cell'], [-11, 'up one row', 'back one cell']]);
      let n; do { n = R.int(12, 89); } while (n % 10 === 0 || n % 10 === 1 || n + d < 1 || n + d > 100);
      const t = n + d, setup = hbBoard();
      return {
        prompt: `Cover ${n}. ${d > 0 ? 'Add' : 'Subtract'} ${Math.abs(d)}: move ${a} and ${b}, and cover where you land. What is ${n} ${d > 0 ? '+' : '−'} ${Math.abs(d)}?`,
        setup, answer: { board: [{ t: 'covered', vals: [n, t], say: `Cover ${n} and the number you land on.` }], box: { key: String(t), label: `${n} ${d > 0 ? '+' : '−'} ${Math.abs(d)}` } },
        hints: [`${a === 'down one row' ? 'Down one row is 10 more' : 'Up one row is 10 less'}: ${n + (d > 0 ? 10 : -10)}.`, `${b === 'back one cell' ? 'Back one cell is 1 less' : 'Forward one cell is 1 more'}.`, `${n} ${d > 0 ? '+' : '−'} ${Math.abs(d)} = ${t}.`],
        explain: `${Math.abs(d) === 9 ? '9 is 10 − 1' : '11 is 10 + 1'}, so ${n} ${d > 0 ? '+' : '−'} ${Math.abs(d)} = ${n} ${d > 0 ? '+' : '−'} 10 ${(d === 9 || d === -11) ? '−' : '+'} 1 = ${t}.`,
        solution: { board: solved(setup, [n, t]), box: String(t) },
      };
    }),
  T('number-neighbors', 'Number neighbors', '1.NBT.C.5', '1',
    'Cover a number and its four neighbors: left, right, above and below. What operation finds each one?',
    'Neighbors are plus or minus 1 and plus or minus 10. Naming the operation turns board geography into arithmetic.',
    R => {
      const n = inner(R), side = R.pick(Object.keys(MOVES)), [d, w] = MOVES[side], t = n + d, setup = hbBoard();
      return {
        prompt: `Cover ${n} and its four neighbors: the numbers left of it, right of it, above it and below it. What number is ${w} ${n}?`,
        setup, answer: { board: [{ t: 'covered', vals: [n, n - 1, n + 1, n - 10, n + 10], say: `Cover ${n} and the four numbers touching its sides.` }], box: { key: String(t), label: `${w} ${n}` } },
        hints: ['Left is 1 less, right is 1 more.', 'Above is 10 less, below is 10 more.', `${w[0].toUpperCase()}${w.slice(1)} ${n} is ${n} ${d > 0 ? '+' : '−'} ${Math.abs(d)} = ${t}.`],
        explain: `The neighbors of ${n} are ${n - 1} and ${n + 1} (1 less and 1 more), ${n - 10} and ${n + 10} (10 less and 10 more).`,
        solution: { board: solved(setup, [n, n - 1, n + 1, n - 10, n + 10]), box: String(t) },
      };
    }),
  T('between-tens', 'Between tens', '3.NBT.A.1', '3',
    'Cover the two tens a number sits between. Which ten is it closer to, and how far is it?',
    'Distance to each ten is counted in steps. Closer ten is the rounding answer, with a reason attached.',
    R => {
      let n; do { n = R.int(11, 99); } while (n % 10 === 0 || n % 10 === 5);
      const lo = Math.floor(n / 10) * 10, hi = lo + 10, close = n - lo < hi - n ? 0 : 1, dist = Math.min(n - lo, hi - n), setup = hbBoard();
      return {
        prompt: `${n} sits between two tens. Cover those two tens. Which one is ${n} closer to? How many steps away is it?`,
        setup, answer: { board: [{ t: 'covered', vals: [lo, hi], say: `Cover the ten just before ${n} and the ten just after it, and nothing else.` }],
          choice: { options: [String(lo), String(hi)], correct: close, say: 'Count the steps from the number to each ten.' }, box: { key: String(dist), label: 'steps to the closer ten' } },
        hints: [`The tens around ${n} are ${lo} and ${hi}.`, `From ${n} back to ${lo} is ${plural(n - lo, 'step')}; on to ${hi} is ${hi - n}.`, `${n} is closer to ${close ? hi : lo}, ${plural(dist, 'step')} away.`],
        explain: `${n} is ${n - lo} from ${lo} and ${hi - n} from ${hi}, so it is closer to ${close ? hi : lo}: that is ${n} rounded to the nearest ten.`,
        solution: { board: solved(setup, [lo, hi]), choice: close, box: String(dist) },
      };
    }),
  T('square-numbers', 'Square numbers', '4.OA.C.5', '4',
    'Cover the square numbers from one square to another. Describe where they sit and the gaps between them.',
    'Gaps grow by odd numbers 3, 5, 7, 9, 11. Children who spot that have found real structure.',
    R => {
      const j = R.int(1, 3), k = R.int(j + 3, 10), m = R.int(j, k - 1), vals = Array.from({ length: k - j + 1 }, (_, i) => (j + i) ** 2), setup = hbBoard();
      return {
        prompt: `Cover the square numbers from ${j * j} (${j} × ${j}) to ${k * k} (${k} × ${k}). How far is it from ${m * m} to the next square, ${(m + 1) ** 2}?`,
        setup, answer: { board: [{ t: 'covered', vals, say: `Cover ${vals.slice(0, 3).join(', ')}... up to ${k * k}: each is a number times itself.` }], box: { key: String(2 * m + 1), label: 'the gap' } },
        hints: [`The squares are ${vals.join(', ')}.`, `Count from ${m * m} to ${(m + 1) ** 2}.`, `${(m + 1) ** 2} − ${m * m} = ${2 * m + 1}.`],
        explain: `The gaps between squares are the odd numbers: ${vals.slice(1).map((v, i) => v - vals[i]).join(', ')}. From ${m * m} to ${(m + 1) ** 2} is ${2 * m + 1}.`,
        solution: { board: solved(setup, vals), box: String(2 * m + 1) },
      };
    }),
  T('two-digit-detective', 'Two-digit detective', '2.NBT.A.3', '2',
    'Two clues point to a secret number. Find it, cover it and check both clues.',
    'Both clues point to 55. Solving from clues reverses the usual direction of board work.',
    R => {
      const x = R.int(12, 89), clue = R.shuffle([[`10 more than ${x - 10}`, x - 10], [`10 less than ${x + 10}`, x + 10], [`1 less than ${x + 1}`, x + 1], [`1 more than ${x - 1}`, x - 1], [`20 more than ${x - 20}`, x - 20]]
        .filter(c => c[1] >= 1 && c[1] <= 100)).slice(0, 2).map(c => c[0]);
      const setup = hbBoard();
      return {
        prompt: `A secret number is ${clue[0]} and ${clue[1]}. Find it and cover it. What is the secret number?`,
        setup, answer: { board: [{ t: 'covered', vals: [x], say: 'Cover only the secret number.' }], box: { key: String(x), label: 'the secret number' } },
        hints: ['10 more or less is a row down or up; 1 more or less is a cell right or left.', `Use the first clue: ${clue[0]}.`, `Both clues land on ${x}.`],
        explain: `${x} is ${clue[0]} and ${clue[1]}: both clues point to the same cell.`,
        solution: { board: solved(setup, [x]), box: String(x) },
      };
    }),
  T('counting-in-25s', 'Counting in 25s', '3.NBT.A.2', '3',
    'Count by 25s across the board and cover every number you land on. What quarters pattern do you see?',
    '25, 50, 75, 100 land in a clear rhythm tied to quarters of 100. Link to money quarters if children know them.',
    R => {
      const h = R.int(0, 8), S0 = 100 * h, k = R.int(1, 3), vals = [25, 50, 75, 100].map(x => S0 + x), want = S0 + 100 + 25 * k;
      const setup = hbBoard({ start: S0 + 1 });
      return {
        prompt: `The board shows ${S0 + 1} to ${S0 + 100}. Count by 25s from ${S0} and cover every number you land on. Then count ${k} more 25s past ${S0 + 100}. Where do you land?`,
        setup, answer: { board: [{ t: 'covered', vals, say: `Cover ${S0 + 25}, ${S0 + 50}, ${S0 + 75} and ${S0 + 100}.` }], box: { key: String(want), label: 'where you land' } },
        hints: [`25 more each time: ${vals.join(', ')}. Four 25s make 100.`, `After ${S0 + 100}, keep going: ${S0 + 125}, ${S0 + 150}, ${S0 + 175}.`, `${S0 + 100} + ${25 * k} = ${want}.`],
        explain: `The 25s land in the same places in every hundred: 25, 50, 75 and 100, like four quarters in a dollar. ${k} more 25s past ${S0 + 100} is ${want}.`,
        solution: { board: solved(setup, vals), box: String(want) },
      };
    }),
  T('odd-even-checkerboard', 'Odd even checkerboard', '2.OA.C.3', '2',
    'Shade the even numbers. What pattern appears, and how does it show whether a number is odd or even?',
    'Evens form columns, odds sit between them. Position alone can decide parity once the pattern is trusted.',
    R => {
      const n = R.int(1, 100), odd = n % 2, setup = hbBoard();
      return {
        prompt: `Tap Multiples of 2 to shade the even numbers. Cover ${n}. Look at its column: is ${n} even or odd?`,
        setup, answer: { board: [{ t: 'mult', m: 2, say: 'Turn on Multiples of 2 in the palette.' }, { t: 'covered', vals: [n], say: `Cover ${n}, and only ${n}.` }], choice: { options: ['Even', 'Odd'], correct: odd, say: 'Is its column shaded?' } },
        hints: ['The even numbers make shaded columns: every other column.', `Look at the column ${n} is in. Is it shaded?`, `${n} ends in ${n % 10}: it is ${odd ? 'odd' : 'even'}.`],
        explain: `${n} is ${odd ? 'odd' : 'even'}. Even numbers end in 0, 2, 4, 6 or 8, so they line up in the shaded columns.`,
        solution: { board: solved(setup, [n], { mult: 2 }), choice: odd },
      };
    }),
  T('subtract-across-rows', 'Subtract across rows', '2.NBT.B.7', '2',
    'Cover a number. Subtract a two-digit number by moving up a row for each ten and left for each one. Where do you land and why does that work?',
    'Up rows subtract tens, right adds ones. Decomposing 23 into 20 and 3 is the strategy being built.',
    R => {
      let n, t, o; do { n = R.int(32, 99); t = R.int(1, Math.floor((n - 1) / 10) - 1); o = R.int(1, 9); } while ((n - 1) % 10 < o);
      const b = 10 * t + o, x = n - b, setup = hbBoard();
      return {
        prompt: `Cover ${n}. Subtract ${b}: move up ${t} ${t === 1 ? 'row' : 'rows'} (10 less each), then left ${o}. Cover where you land. What is ${n} − ${b}?`,
        setup, answer: { board: [{ t: 'covered', vals: [n, x], say: `Cover ${n} and where you land.` }], box: { key: String(x), label: `${n} − ${b}` } },
        hints: [`${b} is ${10 * t} and ${o}. Up ${t} ${t === 1 ? 'row' : 'rows'} from ${n} is ${n - 10 * t}.`, `Then ${o} ${o === 1 ? 'cell' : 'cells'} left: ${n - 10 * t} − ${o}.`, `${n} − ${b} = ${x}.`],
        explain: `${n} − ${10 * t} = ${n - 10 * t} and ${n - 10 * t} − ${o} = ${x}. Taking away the tens, then the ones, is taking away ${b}.`,
        solution: { board: solved(setup, [n, x]), box: String(x) },
      };
    }),
  T('hundred-board-race', 'Hundred board race', '1.NBT.C.4', '1',
    'Start at a number and follow five calls: add 10, add 1 or subtract 10. Cover where you land.',
    'Oral movement games build fluent board navigation. Keep pace brisk and celebrate accurate landings.',
    R => {
      // five calls that never leave the board (an add 1 never wraps to the next row)
      let s, calls, x, ok;
      do {
        s = R.int(1, 40); x = s; calls = []; ok = true;
        for (let i = 0; i < 5; i++) { const c = R.pick([10, 1, 10, -10]); if (c === 1 && x % 10 === 0) ok = false; calls.push(c); x += c; if (x < 1 || x > 100) ok = false; }
      } while (!ok);
      const words = calls.map(c => (c === 10 ? 'add 10' : c === 1 ? 'add 1' : 'subtract 10')), setup = hbBoard();
      return {
        prompt: `Start at ${s}. Follow the calls: ${words.join(', ')}. Cover the number where you land. What is it?`,
        setup, answer: { board: [{ t: 'covered', vals: [x], say: 'Cover only the number where you land.' }], box: { key: String(x), label: 'where you land' } },
        hints: ['Add 10 is one row down, subtract 10 is one row up, add 1 is one cell right.', `After the first two calls you are at ${s + calls[0] + calls[1]}.`, `${s} ${calls.map(c => (c > 0 ? `+ ${c}` : `− ${-c}`)).join(' ')} = ${x}.`],
        explain: `${s} ${calls.map(c => (c > 0 ? `+ ${c}` : `− ${-c}`)).join(' ')} = ${x}.`,
        solution: { board: solved(setup, [x]), box: String(x) },
      };
    }),
  T('decimal-neighbors', 'Decimal neighbors', '5.NBT.B.7', '5',
    'The board shows tenths. Cover a number and its four neighbors: 0.1 more, 0.1 less, 1 more and 1 less.',
    'The same neighbor logic works with tenths. The unit changed, the structure did not.',
    R => {
      let x; do { x = R.int(12, 89) / 10; } while (Math.round(x * 10) % 10 === 0 || Math.round(x * 10) % 10 === 1);
      const [nm, d] = R.pick([['0.1 more', 0.1], ['0.1 less', -0.1], ['1 more', 1], ['1 less', -1]]), r = v => Math.round(v * 10) / 10, t = r(x + d);
      const vals = [x, r(x - 0.1), r(x + 0.1), r(x - 1), r(x + 1)], setup = hbBoard({ decimalMode: true });
      return {
        prompt: `The board shows tenths. Cover ${d1(x)} and its four neighbors: 0.1 less, 0.1 more, 1 less and 1 more. What number is ${nm} than ${d1(x)}?`,
        setup, answer: { board: [{ t: 'covered', vals, say: `Cover ${d1(x)} and the four cells touching its sides.` }], box: { key: d1(t), label: `${nm} than ${d1(x)}` } },
        hints: ['Left and right are 0.1 less and 0.1 more.', 'Above and below are 1 less and 1 more: a row is ten tenths.', `${d1(x)} ${d > 0 ? '+' : '−'} ${Math.abs(d) === 1 ? '1' : '0.1'} = ${d1(t)}.`],
        explain: `The neighbors of ${d1(x)} are ${d1(x - 0.1)} and ${d1(x + 0.1)} (0.1 less and more), ${d1(x - 1)} and ${d1(x + 1)} (1 less and more).`,
        solution: { board: solved(setup, vals), box: d1(t) },
      };
    }),
  T('missing-row', 'Missing row', '2.NBT.A.3', '2',
    'The numbers are hidden. Cover a whole row of the board by its pattern, then name one of its numbers.',
    'A row is one ten repeated in the ones place pattern 0 to 9. Describing it beats memorizing it.',
    R => {
      const r = R.int(0, 9), p = R.int(1, 10), vals = Array.from({ length: 10 }, (_, i) => 10 * r + i + 1), setup = hbBoard({ hidden: true });
      return {
        prompt: `The numbers are hidden. Cover the whole row that starts with ${10 * r + 1}. What number is in the ${ORD[p - 1]} cell of that row?`,
        setup, answer: { board: [{ t: 'covered', vals, say: `Cover all ten cells of the row from ${10 * r + 1} to ${10 * r + 10}, and nothing else.` }], box: { key: String(10 * r + p), label: `the ${ORD[p - 1]} cell` } },
        hints: [`Each row holds ten numbers. The row starting with ${10 * r + 1} is row ${r + 1} from the top.`, `It goes ${10 * r + 1}, ${10 * r + 2}, ${10 * r + 3}... up to ${10 * r + 10}.`, `The ${ORD[p - 1]} cell is ${10 * r + p}.`],
        explain: `The row from ${10 * r + 1} to ${10 * r + 10} keeps the same tens while the ones count up, so its ${ORD[p - 1]} cell is ${10 * r + p}.`,
        solution: { board: solved(setup, vals), box: String(10 * r + p) },
      };
    }),
];
