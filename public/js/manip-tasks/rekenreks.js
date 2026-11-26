// Rekenreks: the tool's 17 tasks as practice (docs/manip-practice-tasks.md). Each task keeps its title, Common Core code,
// grade and teacher notes; prompt is what the task list shows. make(R) gives one variation from a seeded random source
// (public/js/manip-task-kit.js rngOf): the student's prompt with its numbers, the board to start from, what is right, 2
// or 3 hints in Oomba's calm voice, the explanation, and the generator's own solution (for the tests and the
// run-through). conds are this tool's board checks, read from the board's rekenrek objects.
import { boardWith, rowPlaces, objSizeOf, plural, countTo } from '../manip-task-kit.js';

export const SLUG = 'rekenreks';
const NOUNS = ['ladybugs', 'apples', 'frogs', 'stars', 'ducks', 'buttons', 'shells', 'kites'];
const ROW = ['top', 'bottom'];

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
/** A rekenrek object's state: { rows, counts, covered, long, q (read only), label }. */
const rekSt = ({ rows = 2, counts = [], covered = false, long = false, q = false, label = '' } = {}) => {
  const c = Array(10).fill(0); counts.forEach((n, i) => { c[i] = n; });
  return { rows, counts: c, covered, long, ...(q ? { q: true } : {}), ...(label ? { label } : {}) };
};
/** A board with these rekenreks side by side (ids r1, r2, ...). */
export function rekBoard(list) {
  const sts = list.map(rekSt), places = rowPlaces(sts.map(st => objSizeOf(SLUG, SLUG, st)));
  return boardWith(SLUG, sts.map((st, i) => ({ id: `r${i + 1}`, k: SLUG, x: places[i].x, y: places[i].y, s: 1, st })));
}
/** The board's rekenreks as the checks read them: [{ id, label, rows, counts (the visible rows'), covered }]. */
export function reksOf(board) {
  return ((board && Array.isArray(board.objects)) ? board.objects : []).filter(o => o && o.k === SLUG && o.st && typeof o.st === 'object').map(o => {
    const rows = Math.max(1, Math.min(10, Math.round(num(o.st.rows, 2)))), all = Array.isArray(o.st.counts) ? o.st.counts : [];
    return { id: String(o.id || ''), label: String(o.st.label || ''), rows, counts: Array.from({ length: rows }, (_, i) => Math.max(0, Math.round(num(all[i])))), covered: !!o.st.covered };
  });
}
/** The rekenrek a check is about: by its label (Way 1...), else the first one. */
const rekOf = (c, board) => { const l = reksOf(board); return c.label ? l.find(r => r.label === c.label) || null : l[0] || null; };
const sum = a => a.reduce((s, n) => s + n, 0);
/** The same board with these rows set (and Cover), for the solutions: changes [{ label?, counts, covered? }]. */
function solved(setup, changes) {
  const b = JSON.parse(JSON.stringify(setup));
  for (const ch of changes) {
    const o = b.objects.find(x => x.k === SLUG && (ch.label ? x.st.label === ch.label : true));
    const c = Array(10).fill(0); ch.counts.forEach((n, i) => { c[i] = n; });
    o.st.counts = c; if (ch.rows) o.st.rows = ch.rows; if (ch.covered !== undefined) o.st.covered = ch.covered;
  }
  return b;
}

// ---------------------------------------------------------------- the checks
export const conds = {
  /** Exactly these counts on the rows (rows not named: 0), with at least as many rows. */
  rows: (c, b) => { const r = rekOf(c, b); return !!r && r.rows >= c.counts.length && r.counts.every((n, i) => n === (c.counts[i] || 0)); },
  /** These counts in either order on the first two rows (the rest 0). */
  pair: (c, b) => { const r = rekOf(c, b); if (!r || r.rows < 2) return false; const [x, y] = r.counts, [p, q] = c.counts; return ((x === p && y === q) || (x === q && y === p)) && sum(r.counts.slice(2)) === 0; },
  /** The rekenrek shows n in all. */
  total: (c, b) => { const r = rekOf(c, b); return !!r && sum(r.counts) === c.n; },
  /** n on one row only (rows: how many rows the rekenrek has, when it matters). */
  oneRow: (c, b) => { const r = rekOf(c, b); return !!r && (!c.rows || r.rows === c.rows) && r.counts.filter(n => n > 0).length === 1 && sum(r.counts) === c.n; },
  /** n split over the top two rows, both used, the rest empty; not with `not` beads on the top row. */
  split: (c, b) => { const r = rekOf(c, b); if (!r || r.rows < 2) return false; const [x, y] = r.counts; return x > 0 && y > 0 && x + y === c.n && sum(r.counts.slice(2)) === 0 && (c.not === undefined || x !== c.not); },
  /** Every row in groups of 5 (0, 5 or 10 beads). */
  fives: (c, b) => { const r = rekOf(c, b); return !!r && r.counts.every(n => n % 5 === 0); },
  /** Cover is on (or off). */
  covered: (c, b) => { const r = rekOf(c, b); return !!r && r.covered === c.on; },
};

// ---------------------------------------------------------------- the tasks
// (every variation hides the totals: a practice board: no total gives an answer away; each row still shows its own count)
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
export const TASKS = [
  T('show-7-the-5-way', 'Show a number the 5-way', 'K.OA.A.3', 'K',
    'Show a number from 6 to 10 on one row: push all 5 red beads first, then count on with white beads. Type how many white beads you used.',
    'Watch for children who count beads one by one from the left. Prompt them to trust the full red group of 5 and count on, which is the whole point of the 5-structure.',
    R => {
      const n = R.int(6, 10), r = R.int(0, 1), noun = R.pick(NOUNS), w = n - 5, counts = r ? [0, n] : [n, 0];
      const setup = rekBoard([{ rows: 2 }]);
      return {
        prompt: `There are ${n} ${noun}. Show ${n} on the ${ROW[r]} row: push all 5 red beads first, then count on with white beads. How many white beads did you use?`,
        setup, answer: { board: [{ t: 'rows', counts, say: `Show ${n} on the ${ROW[r]} row only.` }], box: { key: String(w), label: 'white beads' } },
        hints: [`Tap the 5th red bead on the ${ROW[r]} row. All 5 red beads slide over together.`, `Now count on with white beads: 6${n > 6 ? `, 7${n > 7 ? ', ...' : ''}` : ''} until you reach ${n}.`, `5 red and ${w} white make ${n}. Type ${w}.`],
        explain: `5 + ${w} = ${n}. The 5 red beads are a group you can see at once, so you only count on the white ones.`,
        solution: { board: solved(setup, [{ counts }]), box: String(w) },
      };
    }),
  T('hidden-beads', 'Hidden beads', '1.OA.B.4', '1',
    'Cover is on. You know how many beads there are in all and how many are on the top row. Work out how many are hidden on the bottom row.',
    'The cover tool turns counting into reasoning: partners must use the visible beads and the row total. Ask for the strategy, not just the answer.',
    R => {
      const total = R.int(11, 19), top = R.int(Math.max(5, total - 10), Math.min(10, total - 1)), bot = total - top;
      const setup = rekBoard([{ rows: 2, counts: [top, bot], covered: true, q: true }]);
      return {
        prompt: `Cover is on, so you can't see the beads. There are ${total} beads in all. The top row has ${top}. How many beads are on the bottom row?`,
        setup, answer: { box: { key: String(bot), label: 'beads on the bottom row' } },
        hints: [`Start at ${top}, the top row. How many more to get to ${total}?`, `Count on from ${top}: ${countTo(bot, i => top + i)}.`, `${top} + ${bot} = ${total}, so the bottom row has ${bot}.`],
        explain: `${top} + ${bot} = ${total}. When you know the whole and one part, you can find the other part without seeing it.`,
        solution: { board: setup, box: String(bot) },
      };
    }),
  T('two-ways-to-make-10', 'Two ways to make a number', '1.OA.C.6', '1',
    'Show the same number two different ways, using both rows of each rekenrek: Way 1 starts with the beads it names on the top row, Way 2 uses a different split.',
    'Children often only find 5 + 5. Nudge them to slide one bead at a time and notice each new split keeps the total at 10.',
    R => {
      const n = R.int(6, 10), a = R.int(1, n - 1), noun = R.pick(NOUNS);
      const setup = rekBoard([{ rows: 2, label: 'Way 1' }, { rows: 2, label: 'Way 2' }]);
      const b2 = a === 1 ? 2 : 1;
      return {
        prompt: `Make ${n} ${noun} two different ways. On Way 1, put ${a} on the top row and the rest on the bottom row. On Way 2, make ${n} with a different number on the top row.`,
        setup, answer: { board: [
          { t: 'rows', label: 'Way 1', counts: [a, n - a], say: `On Way 1, put ${a} on the top row and ${n - a} on the bottom row.` },
          { t: 'split', label: 'Way 2', n, not: a, say: `On Way 2, use both rows to make ${n}, with a top row that is not ${a}.` }] },
        hints: [`Way 1: ${a} on top. How many more make ${n}? Put them on the bottom row.`, `Way 2: try a different top row, like ${b2}. Then fill the bottom row up to ${n}.`, `For example ${a} + ${n - a} and ${b2} + ${n - b2} both make ${n}.`],
        explain: `${a} + ${n - a} = ${n} and ${b2} + ${n - b2} = ${n}. Moving a bead from one row to the other changes the parts, but the total stays ${n}.`,
        solution: { board: solved(setup, [{ label: 'Way 1', counts: [a, n - a] }, { label: 'Way 2', counts: [b2, n - b2] }]) },
      };
    }),
  T('near-doubles', 'Near doubles', '2.OA.B.2', '2',
    'Show a near double, like 6 + 7, on two rows. Use the double you can see to find the sum.',
    'Line the rows up so the extra bead is visible. This builds the near-doubles strategy before it is taught symbolically.',
    R => {
      const a = R.int(2, 9), bigTop = R.chance(), less = R.chance(), top = bigTop ? a + 1 : a, bot = bigTop ? a : a + 1, s = 2 * a + 1;
      const setup = rekBoard([{ rows: 2 }]);
      return {
        prompt: `Show ${top} + ${bot}: ${top} on the top row and ${bot} on the bottom row. ${less ? `It is one less than double ${a + 1}.` : `It is one more than double ${a}.`} What is ${top} + ${bot}?`,
        setup, answer: { board: [{ t: 'rows', counts: [top, bot], say: `Put ${top} on the top row and ${bot} on the bottom row.` }], box: { key: String(s), label: 'the sum' } },
        hints: [`Line up the rows. ${a} beads on each row match: that is double ${a}.`, `Double ${a} is ${2 * a}. One row has one extra bead.`, `${2 * a} + 1 = ${s}.`],
        explain: `${top} + ${bot} = ${s}. Double ${a} is ${2 * a}, and the extra bead makes it one more.`,
        solution: { board: solved(setup, [{ counts: [top, bot] }]), box: String(s) },
      };
    }),
  T('teen-numbers-as-10-and-more', 'Teen numbers as 10 and more', '1.NBT.B.2b', '1',
    'Show a teen number as a full row of 10 and some more on the next row. Type how many are on the bottom row.',
    'Teen numbers should be read as 10 plus a single digit. If a child counts bead by bead, point to the full row and ask them to trust it as ten.',
    R => {
      const n = R.int(11, 19), k = n - 10, noun = R.pick(NOUNS);
      const setup = rekBoard([{ rows: 2 }]);
      return {
        prompt: `Show ${n} ${noun} as a full row of 10 on the top row and the rest on the bottom row. How many are on the bottom row?`,
        setup, answer: { board: [{ t: 'rows', counts: [10, k], say: `Fill the top row with 10, then put the rest of ${n} on the bottom row.` }], box: { key: String(k), label: 'beads on the bottom row' } },
        hints: ['Tap the last bead on the top row to fill it: that is 10.', `Ten and how many more make ${n}? Count on from 10: ${countTo(k, i => 10 + i)}.`, `10 + ${k} = ${n}. Put ${k} on the bottom row.`],
        explain: `${n} is ten and ${word10(k)}: 10 + ${k} = ${n}.`,
        solution: { board: solved(setup, [{ counts: [10, k] }]), box: String(k) },
      };
    }),
  T('make-9-three-ways', 'Make a number three ways', '1.OA.C.6', '1',
    'Show the same number three ways: on one row, on two rows, and with Cover hiding the beads.',
    'Seeing the same total in different arrangements builds flexibility. Ask which way makes 9 easiest to see at a glance and why.',
    R => {
      const n = R.int(4, 10), noun = R.pick(NOUNS);
      const setup = rekBoard([{ rows: 1, label: 'Way 1' }, { rows: 2, label: 'Way 2' }, { rows: 2, label: 'Way 3' }]);
      const a = Math.ceil(n / 2);
      return {
        prompt: `Show ${n} ${noun} three ways. Way 1: all ${n} on its one row. Way 2: some on each row. Way 3: show ${n}, then turn on Cover.`,
        setup, answer: { board: [
          { t: 'oneRow', label: 'Way 1', n, rows: 1, say: `On Way 1, put all ${n} on the one row.` },
          { t: 'split', label: 'Way 2', n, say: `On Way 2, use both rows to make ${n}.` },
          { t: 'total', label: 'Way 3', n, say: `On Way 3, show ${n}.` },
          { t: 'covered', label: 'Way 3', on: true, say: 'On Way 3, tap the rekenrek, then tap Cover.' }] },
        hints: [`Way 1 has one row. Tap bead ${n} to show ${n}.`, `Way 2: try ${a} on the top row and ${n - a} on the bottom row.`, 'Way 3: show the number, tap that rekenrek, then tap Cover in the palette.'],
        explain: `${n} on one row, ${a} + ${n - a}, or hidden under Cover: it is still ${n}. The number stays the same however you arrange it.`,
        solution: { board: solved(setup, [{ label: 'Way 1', counts: [n] }, { label: 'Way 2', counts: [a, n - a] }, { label: 'Way 3', counts: n > 10 ? [10, n - 10] : [n], covered: true }]) },
      };
    }),
  T('count-back-from-18', 'Count back from a teen number', '1.OA.C.5', '1',
    'Start from a teen number across two rows. Slide beads back to take some away. Where do you land?',
    'Counting back across the ten boundary is the hard part. Encourage landing on 10 first, then counting back the rest.',
    R => {
      const b = R.int(3, 9), n = 10 + b, k = R.int(2, 9), left = n - k;
      const setup = rekBoard([{ rows: 2, counts: [10, b] }]);
      return {
        prompt: `The rekenrek shows ${n}. Slide beads back to take away ${k}. How many are left?`,
        setup, answer: { board: [{ t: 'total', n: left, say: `Take away ${k} beads so the rekenrek shows what is left.` }], box: { key: String(left), label: 'how many are left' } },
        hints: [k > b ? `First slide back the ${b} on the bottom row. That takes you to 10.` : `Slide back ${k} beads on the bottom row.`, k > b ? `You took away ${b}. Take away ${k - b} more from the top row.` : `Count what is left: 10 and ${b - k}.`, `${n} - ${k} = ${left}.`],
        explain: `${n} - ${k} = ${left}.${k > b ? ` Going back to 10 first (${b}), then ${k - b} more, makes it easier.` : ''}`,
        solution: { board: solved(setup, [{ counts: left > 10 ? [10, left - 10] : [left, 0] }]), box: String(left) },
      };
    }),
  T('doubles-plus-one', 'Doubles plus one', '2.OA.B.2', '2',
    'Show a double on two equal rows, then add one extra bead. What addition have you built?',
    'This is the near-double strategy in concrete form. Name it after children discover the extra bead changes 14 to 15.',
    R => {
      const a = R.int(2, 9), r = R.int(0, 1), noun = R.pick(NOUNS.slice(0, 4)), counts = r ? [a, a + 1] : [a + 1, a];
      const setup = rekBoard([{ rows: 2 }]);
      return {
        prompt: `Show double ${a}: ${a} ${noun} on each row. Then add one more bead to the ${ROW[r]} row. How many in all?`,
        setup, answer: { board: [{ t: 'rows', counts, say: `Put ${a} on each row, then one more on the ${ROW[r]} row.` }], box: { key: String(2 * a + 1), label: 'how many in all' } },
        hints: [`Put ${a} beads on each row. That is double ${a}: ${2 * a}.`, `Now add one bead to the ${ROW[r]} row: it shows ${a + 1}.`, `${a} + ${a + 1} = ${2 * a} + 1 = ${2 * a + 1}.`],
        explain: `${a} + ${a + 1} = ${2 * a + 1}. Double ${a} is ${2 * a}, and one more makes ${2 * a + 1}.`,
        solution: { board: solved(setup, [{ counts }]), box: String(2 * a + 1) },
      };
    }),
  T('missing-part-to-15', 'Missing part to a teen number', '1.OA.D.8', '1',
    'The top row shows some beads. How many more are needed to reach the total? Build the missing part underneath.',
    'Missing-addend problems prepare for subtraction as finding a difference, not just taking away.',
    R => {
      const total = R.int(11, 19), a = R.int(Math.max(5, total - 10), Math.min(10, total - 1)), m = total - a;
      const setup = rekBoard([{ rows: 2, counts: [a] }]);
      return {
        prompt: `The top row shows ${a}. How many more make ${total} in all? Build the missing part on the bottom row.`,
        setup, answer: { board: [{ t: 'rows', counts: [a, m], say: `Keep ${a} on top and build the missing part on the bottom row.` }], box: { key: String(m), label: 'the missing part' } },
        hints: [`Leave the top row at ${a}. Add beads to the bottom row one at a time.`, `Stop when both rows together show ${total}.`, `${a} + ${m} = ${total}. The missing part is ${m}.`],
        explain: `${a} + ${m} = ${total}, so ${total} - ${a} = ${m}. Finding the missing part is another way to subtract.`,
        solution: { board: solved(setup, [{ counts: [a, m] }]), box: String(m) },
      };
    }),
  T('even-or-odd-check', 'Even or odd check', '2.OA.C.3', '2',
    'Build a number in pairs across two rows: the same on each row, and the extra bead on the top row if one is left over. Is it even or odd?',
    'Pairing is a physical test for even and odd. The leftover bead for odd numbers should be pointed out explicitly.',
    R => {
      const n = R.int(3, 20), noun = R.pick(['socks', 'shoes', 'mittens']), top = Math.ceil(n / 2), bot = Math.floor(n / 2), odd = n % 2;
      const setup = rekBoard([{ rows: 2 }]);
      return {
        prompt: `Build ${n} ${noun} in pairs: the same number on each row, and if one is left over, put it on the top row. Is ${n} even or odd?`,
        setup, answer: { board: [{ t: 'rows', counts: [top, bot], say: `Share ${n} between the rows: ${odd ? 'the top row gets the extra one' : 'both rows the same'}.` }],
          choice: { options: ['Even', 'Odd'], correct: odd } },
        hints: [`Put beads on the rows one pair at a time, one on each row, until you reach ${n}.`, odd ? 'Is one bead left without a partner?' : 'Does every bead have a partner on the other row?', `${top} and ${bot}: ${odd ? 'one bead has no partner, so it is odd' : 'every bead has a partner, so it is even'}.`],
        explain: `${n} is ${odd ? 'odd' : 'even'}: ${odd ? `${plural(bot, 'pair')} and one left over` : `${bot} pairs, none left over`}.`,
        solution: { board: solved(setup, [{ counts: [top, bot] }]), choice: odd },
      };
    }),
  T('three-numbers-to-20', 'Add three numbers within 20', '2.OA.B.2', '2',
    'Use three rows to show three numbers. Find a pair that makes 10 first, then add the last row.',
    'Hunting for a ten first is a key mental strategy. Let children rearrange the order and notice the total stays the same.',
    R => {
      const x = R.int(1, 9), c = R.int(1, 9), nums = R.shuffle([x, 10 - x, c]), s = 10 + c;
      const setup = rekBoard([{ rows: 5 }]);
      const pair = nums.indexOf(c) === 0 ? [nums[1], nums[2]] : nums.indexOf(c) === 1 ? [nums[0], nums[2]] : [nums[0], nums[1]];
      return {
        prompt: `Show ${nums.join(' + ')}: one number on each of the first three rows. Find two that make 10, then add the last one. What is the total?`,
        setup, answer: { board: [{ t: 'rows', counts: nums, say: `Put ${nums[0]}, ${nums[1]} and ${nums[2]} on the first three rows.` }], box: { key: String(s), label: 'the total' } },
        hints: [`Row 1: ${nums[0]}, row 2: ${nums[1]}, row 3: ${nums[2]}.`, `Which two make 10? Look at ${pair[0]} and ${pair[1]}.`, `${pair[0]} + ${pair[1]} = 10, and 10 + ${c} = ${s}.`],
        explain: `${nums.join(' + ')} = ${s}. Making 10 first (${pair[0]} + ${pair[1]}) and then adding ${c} is quick.`,
        solution: { board: solved(setup, [{ counts: nums }]), box: String(s) },
      };
    }),
  T('compare-two-rows', 'Compare two rows', '1.OA.A.1', '1',
    'Show one number on the top row and another on the bottom row. How many more is the bigger one? Line them up to see the difference.',
    'Difference is visible as the unmatched beads when rows are lined up. Language matters: say how many more, not just take away.',
    R => {
      const lo = R.int(1, 8), hi = R.int(lo + 1, 10), bigTop = R.chance(), top = bigTop ? hi : lo, bot = bigTop ? lo : hi, d = hi - lo;
      const setup = rekBoard([{ rows: 2 }]);
      return {
        prompt: `Show ${top} on the top row and ${bot} on the bottom row. How many more is ${hi} than ${lo}?`,
        setup, answer: { board: [{ t: 'rows', counts: [top, bot], say: `Put ${top} on the top row and ${bot} on the bottom row.` }], box: { key: String(d), label: 'how many more' } },
        hints: [`Line up the rows. ${plural(lo, 'bead')} on each row ${lo === 1 ? 'matches' : 'match'}.`, `Count the beads on the ${bigTop ? 'top' : 'bottom'} row that have no partner.`, `${hi} - ${lo} = ${d}.`],
        explain: `${hi} is ${d} more than ${lo}: the ${plural(d, 'bead')} with no partner ${d === 1 ? 'shows' : 'show'} the difference.`,
        solution: { board: solved(setup, [{ counts: [top, bot] }]), box: String(d) },
      };
    }),
  T('build-20-hide-10', 'Build a teen number, then hide it', 'K.NBT.A.1', 'K',
    'Fill the top row with 10 and put some beads on the bottom row. Turn on Cover. How many are hidden, without counting one by one?',
    'A full covered row must be 10 because every row holds 10. This moves children from counting to reasoning about structure.',
    R => {
      const k = R.int(1, 9), noun = R.pick(NOUNS.slice(0, 4));
      const setup = rekBoard([{ rows: 2 }]);
      return {
        prompt: `Fill the top row with 10 ${noun}. Put ${k} on the bottom row. Then tap the rekenrek and turn on Cover. How many beads are hidden?`,
        setup, answer: { board: [{ t: 'rows', counts: [10, k], say: `Fill the top row and put ${k} on the bottom row.` }, { t: 'covered', on: true, say: 'Tap the rekenrek, then tap Cover.' }], box: { key: String(10 + k), label: 'how many are hidden' } },
        hints: ['Tap the last bead on the top row: a full row is 10.', `A full row is always 10. 10 and ${k} more is how many?`, `10 + ${k} = ${10 + k}.`],
        explain: `10 + ${k} = ${10 + k}. A full row is always 10, so you know without counting.`,
        solution: { board: solved(setup, [{ counts: [10, k], covered: true }]), box: String(10 + k) },
      };
    }),
  T('subtract-to-the-benchmark', 'Subtract to the benchmark', '2.NBT.B.5', '2',
    'Start from a teen number. Slide beads back to land exactly on 10, then slide back some more. What did you subtract in total?',
    'Breaking subtraction at the ten benchmark mirrors bridging in addition and makes larger subtractions manageable.',
    R => {
      const b = R.int(1, 9), n = 10 + b, m = R.int(1, 9), k = b + m;
      const setup = rekBoard([{ rows: 2, counts: [10, b] }]);
      return {
        prompt: `The rekenrek shows ${n}. Slide beads back to land on 10, then slide back ${m} more. How many did you take away in all?`,
        setup, answer: { board: [{ t: 'total', n: 10 - m, say: `Land on 10, then take away ${m} more.` }], box: { key: String(k), label: 'how many in all' } },
        hints: [`To land on 10, slide back the ${b} on the bottom row.`, `Now slide back ${m} more on the top row. You took away ${b} and ${m}.`, `${b} + ${m} = ${k}.`],
        explain: `${n} - ${k} = ${10 - m}. You took away ${b} to reach 10, then ${m} more: ${k} in all.`,
        solution: { board: solved(setup, [{ counts: [10 - m, 0] }]), box: String(k) },
      };
    }),
  T('five-wise-counting', 'Five-wise counting', '2.NBT.A.2', '2',
    'Push beads in groups of 5 only, counting 5, 10, 15 as each group lands. How many groups make the number?',
    'Counting in fives is anchored by the red groups of five. Connect the spoken pattern to the visual groups.',
    R => {
      const g = R.int(1, 10), n = 5 * g, noun = R.pick(['fingers', 'toes', 'nickels']);
      const setup = rekBoard([{ rows: 5 }]);
      return {
        prompt: `Count ${n} ${noun} by fives. Push beads in groups of 5 only, saying 5, 10, 15 as each group lands. How many groups of 5 make ${n}?`,
        setup, answer: { board: [{ t: 'total', n, say: `Show ${n} in all.` }, { t: 'fives', say: 'Use groups of 5: each row shows 0, 5 or 10.' }], box: { key: String(g), label: 'groups of 5' } },
        hints: ['Tap the 5th bead on a row: 5 beads move together.', g === 1 ? 'One group of 5 beads is 5.' : `Count by fives as you go: ${countTo(g, 5, 'until you say')}.`, `${plural(g, 'group')} of 5 ${g === 1 ? 'makes' : 'make'} ${n}.`],
        explain: `${plural(g, 'five')} ${g === 1 ? 'makes' : 'make'} ${n}: ${Array.from({ length: g }, (_, i) => 5 * (i + 1)).join(', ')}.`,
        solution: { board: solved(setup, [{ counts: Array.from({ length: 5 }, (_, i) => Math.max(0, Math.min(10, n - 10 * i))) }]), box: String(g) },
      };
    }),
  T('story-beads-birds', 'Story beads: birds', '1.OA.A.1', '1',
    'A story about birds: some were there, then more landed. Show the story on two rows and find how many in all.',
    'Stories give addition a meaning beyond beads. Ask children to tell the story back before they write symbols.',
    R => {
      const a = R.int(2, 10), b = R.int(1, Math.min(10, 20 - a)), where = R.pick(['on a wire', 'in a tree', 'on the roof', 'on a fence']);
      const setup = rekBoard([{ rows: 2 }]);
      return {
        prompt: `There were ${plural(a, 'bird')} ${where}. Then ${b} more landed. Show the story: ${a} on the top row, ${b} on the bottom row. How many birds are there now?`,
        setup, answer: { board: [{ t: 'rows', counts: [a, b], say: `Put ${a} on the top row and ${b} on the bottom row.` }], box: { key: String(a + b), label: 'how many birds' } },
        hints: [`Top row: the ${a} birds that were there first.`, `Bottom row: the ${b} that landed. Now count both rows.`, `${a} + ${b} = ${a + b}.`],
        explain: `${a} + ${b} = ${a + b}. The story's two groups are the two rows.`,
        solution: { board: solved(setup, [{ counts: [a, b] }]), box: String(a + b) },
      };
    }),
  T('half-of-10-half-of-20', 'Half of an even number', '2.G.A.3', '2',
    'Show half of a number on the rekenrek. How are the halves of 10 and 20 related?',
    'Half of 20 uses the same five-bead group in each row. This plants the idea that halves scale with the whole.',
    R => {
      const n = 2 * R.int(1, 10), h = n / 2, noun = R.pick(['cookies', 'grapes', 'crayons']);
      const setup = rekBoard([{ rows: 2 }]);
      return {
        prompt: `Share ${n} ${noun} into two equal halves. Show one half on the rekenrek. What is half of ${n}?`,
        setup, answer: { board: [{ t: 'total', n: h, say: `Show one half of ${n}.` }], box: { key: String(h), label: 'half' } },
        hints: [`Half means two equal parts. Two equal rows that make ${n} show it.`, `Try ${h} on the top row and ${h} on the bottom row: do they make ${n}?`, `${h} + ${h} = ${n}, so half of ${n} is ${h}. Show ${h} on the rekenrek.`],
        explain: `Half of ${n} is ${h}, because ${h} + ${h} = ${n}.`,
        solution: { board: solved(setup, [{ counts: h > 10 ? [10, h - 10] : [h, 0] }]), box: String(h) },
      };
    }),
];
function word10(k) { return ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][k] || String(k); }
