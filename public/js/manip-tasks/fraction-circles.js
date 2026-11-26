// Fraction Circles: the tool's 17 tasks as practice (docs/manip-practice-tasks.md). As in rekenreks.js: each task keeps
// its title, code, grade and notes; make(R) gives one variation from a seeded random source; conds are this tool's board
// checks, read from the board's fraction sets (their circles, each with its pieces: manip-board.js fcCircles, which also
// reads the old { placed } format). A practice board has one fraction set to work in, one fraction to a circle.
import { boardWith, rowPlaces, objSizeOf, plural } from '../manip-task-kit.js';
import { fcCircles, FC_WHOLE } from '../manip-board.js';

export const SLUG = 'fraction-circles';
/** The piece sizes a task may use (the set's own, without ninths unless a task asks for them). */
const DENS = [2, 3, 4, 5, 6, 8, 10, 12];
const U = d => FC_WHOLE / d;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);
const fr = (n, d) => `${n}/${d}`;
/** n/d in lowest terms as a mixed number: "3/4", "1 1/4", "2". */
function mixed(n, d) {
  const w = Math.floor(n / d), r = n % d, g = gcd(r, d);
  return r ? `${w ? `${w} ` : ''}${r / g}/${d / g}` : String(w);
}
const dec = x => String(+x.toFixed(3));
const pct = x => String(+(x * 100).toFixed(1));
const pieces = (n, d) => `${plural(n, `piece of 1/${d}`, `pieces of 1/${d}`)}`;
/** Up to three answer options: the right one first in `all`, then the wrong ones, unique; shuffled. -> { options, correct } */
function options(R, right, wrong, n = 3) {
  const out = [right];
  for (const w of wrong) if (out.length < n && w && !out.includes(w)) out.push(w);
  const sh = R.shuffle(out);
  return { options: sh, correct: sh.indexOf(right) };
}

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
/** A fraction set's state: circles given as lists of denominators ([[4, 4], []]: a circle with two 1/4 pieces, an empty one). */
const setSt = ({ circles = [[]], mode = 'frac', q = false } = {}) => ({
  circles: circles.map((ps, i) => ({ id: `c${i + 1}`, ps: ps.map((d, j) => ({ id: `p${i + 1}_${j + 1}`, d })) })),
  sel: null, mode, rings: false, ...(q ? { q: true } : {}),
});
/** A board with these fraction sets side by side (ids f1, f2, ...); the one to work in goes last (the palette works on it). */
export function fcBoard(list = [{}]) {
  const sts = list.map(setSt), places = rowPlaces(sts.map(st => objSizeOf(SLUG, SLUG, st)));
  return boardWith(SLUG, sts.map((st, i) => ({ id: `f${i + 1}`, k: SLUG, x: places[i].x, y: places[i].y, s: 1, st })));
}
/** The same board with the set to work in (the last one not read only) holding these circles, label mode and rings. */
function solved(setup, circles, { mode, rings } = {}) {
  const b = JSON.parse(JSON.stringify(setup)), o = b.objects.filter(x => x.k === SLUG && !x.st.q).pop();
  o.st.circles = setSt({ circles }).circles;
  if (mode) o.st.mode = mode;
  if (rings !== undefined) o.st.rings = rings;
  return b;
}
/** Denominators for a fraction n/d (n pieces of 1/d). */
const of = (n, d) => Array(n).fill(d);

// ---------------------------------------------------------------- the checks
/** The fraction sets a student works in (not the read-only ones). */
const setsOf = b => ((b && Array.isArray(b.objects)) ? b.objects : []).filter(o => o && o.k === SLUG && o.st && typeof o.st === 'object' && !o.st.q);
/** Every circle of those sets with something in it: [{ used (360ths), n: { d: count } , dens: Set }]. */
function circlesOf(b) {
  return setsOf(b).flatMap(o => fcCircles(o.st)).filter(c => c.ps.length).map(c => {
    const n = {}; for (const p of c.ps) n[p.d] = (n[p.d] || 0) + 1;
    return { used: c.ps.reduce((s, p) => s + U(p.d), 0), n, dens: new Set(c.ps.map(p => p.d)) };
  });
}
/** Does a circle fit a spec: counts (exactly these pieces), u (its sum in 360ths), only (sizes allowed), one (one size only). */
function fits(c, s) {
  if (s.counts) { const want = Object.entries(s.counts).filter(([, n]) => n > 0); if (want.length !== Object.keys(c.n).length || want.some(([d, n]) => c.n[d] !== n)) return false; }
  if (s.u !== undefined && c.used !== s.u) return false;
  if (s.only && [...c.dens].some(d => !s.only.includes(d))) return false;
  if (s.one && c.dens.size !== 1) return false;
  return true;
}
/** Distinct circles for every spec of a list (a small search: a few circles at most). */
function match(cs, list, used = new Set()) {
  if (!list.length) return true;
  const [s, ...rest] = list;
  return cs.some((c, i) => !used.has(i) && fits(c, s) && match(cs, rest, new Set([...used, i])));
}
export const conds = {
  /** Some circle fits the spec (counts, u, only, one). */
  circle: (c, b) => circlesOf(b).some(x => fits(x, c)),
  /** A different circle for each spec of c.list. */
  circles: (c, b) => match(circlesOf(b), c.list || []),
  /** All the pieces together make u 360ths (only: sizes allowed). */
  total: (c, b) => { const cs = circlesOf(b); return cs.reduce((s, x) => s + x.used, 0) === c.u && (!c.only || cs.every(x => [...x.dens].every(d => c.only.includes(d)))); },
  /** The labels are in one of these modes ('frac', 'pct', 'dec'). */
  mode: (c, b) => setsOf(b).some(o => (c.modes || []).includes(o.st.mode)),
  /** The rings view is on. */
  rings: (c, b) => setsOf(b).some(o => !!o.st.rings === !!c.on),
  /** At least n full circles using only the sizes in dens, each a different mix of pieces. */
  ways: (c, b) => {
    const seen = new Set();
    for (const x of circlesOf(b)) if (x.used === FC_WHOLE && [...x.dens].every(d => (c.dens || []).includes(d))) seen.add((c.dens || []).map(d => x.n[d] || 0).join(','));
    return seen.size >= num(c.n, 2);
  },
};

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make, totals = true) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ ...(totals ? {} : { totals: false }), ...make(R) }) });
const NAMES = ['Mia', 'Leo', 'Ava', 'Sam', 'Zoe', 'Eli', 'Nia', 'Omar'];
const FOODS = ['pizza', 'pie', 'tart', 'quesadilla'];
/** Every (a, b) with b < D a multiple of b in the circles' sizes: for "a/b = ?/D". */
const MULTS = [];
for (const b of [2, 3, 4, 5, 6]) for (const D of [4, 6, 8, 9, 10, 12]) if (D > b && D % b === 0) MULTS.push([b, D]);

export const TASKS = [
  T('cover-the-whole', 'Cover the whole', '4.NF.B.3', '4',
    'Cover one whole circle exactly using only two piece sizes, like thirds and sixths, with some of one size given. How many of the other size do you need?',
    '1/3 + 1/3 + 1/6 + 1/6 = 1 is within reach once children see two sixths sit on a third. Let them discover the pairing.',
    R => {
      const [b, s] = R.pick([[3, 6], [2, 4], [2, 6], [2, 8], [3, 12], [4, 8], [4, 12], [5, 10], [6, 12], [3, 6], [2, 10], [2, 12]]);
      const k = R.int(1, b - 1), m = (s * (b - k)) / b, askSmall = R.chance();
      const setup = fcBoard();
      const given = askSmall ? `Use ${pieces(k, b)}.` : `Use ${pieces(m, s)}.`, ans = askSmall ? m : k, ask = askSmall ? s : b;
      return {
        prompt: `Cover one whole circle using only 1/${b} and 1/${s} pieces. ${given} How many 1/${ask} pieces do you need?`,
        setup, answer: { board: [{ t: 'circle', counts: { [b]: k, [s]: m }, say: `Fill one circle with 1/${b} and 1/${s} pieces only, starting with the ones given.` }], box: { key: String(ans), label: `1/${ask} pieces` } },
        hints: [askSmall ? `Put the ${pieces(k, b)} in the circle first.` : `Put the ${pieces(m, s)} in the circle first.`, `Now add 1/${ask} pieces until the circle says 1 whole.`, `${k}/${b} + ${m}/${s} = 1 whole. You need ${ans}.`],
        explain: `One 1/${b} piece covers the same as ${s / b} pieces of 1/${s}, so ${k}/${b} + ${m}/${s} = 1 whole.`,
        solution: { board: solved(setup, [[...of(k, b), ...of(m, s)]]), box: String(ans) },
      };
    }),
  T('bigger-1-3-or-1-4', 'Which fraction is bigger?', '3.NF.A.3d', '3',
    'Show two fractions with the same numerator, each in its own circle, like 1/3 and 1/4. Which is bigger?',
    'The classic error is 1/4 is bigger because 4 is bigger. The overlap settles it: more pieces means each piece is smaller.',
    R => {
      const [a, b] = R.shuffle([2, 3, 4, 6, 8]).slice(0, 2), lo = Math.min(a, b), n = lo > 2 && R.chance(0.4) ? R.int(2, lo - 1) : 1;
      const big = Math.min(a, b), setup = fcBoard();
      const opts = [fr(n, a), fr(n, b), 'They are the same'];
      return {
        prompt: `Show ${fr(n, a)} in one circle and ${fr(n, b)} in another circle. Which is bigger?`,
        setup, answer: { board: [{ t: 'circles', list: [{ counts: { [a]: n } }, { counts: { [b]: n } }], say: `Show ${fr(n, a)} in one circle and ${fr(n, b)} in a new circle.` }],
          choice: { options: opts, correct: opts.indexOf(fr(n, big)), say: 'Look at how much of each circle is covered.' } },
        hints: [`Put ${pieces(n, a)} in the first circle. Tap New circle, then put ${pieces(n, b)} in it.`, 'Compare the circles: which one has more covered?', `A 1/${big} piece is bigger than a 1/${Math.max(a, b)} piece, so ${fr(n, big)} is bigger.`],
        explain: `${fr(n, big)} is bigger. Cutting a whole into more pieces makes each piece smaller, so 1/${Math.max(a, b)} pieces are smaller than 1/${big} pieces.`,
        solution: { board: solved(setup, [of(n, a), of(n, b)]), choice: opts.indexOf(fr(n, big)) },
      };
    }),
  T('percent-switch', 'Percent switch', '6.RP.A.3c', '6',
    'Build a fraction of a circle. Switch the labels to percent and to decimal. Type the percent and pick the decimal.',
    'Same pieces, three labels: 3/4, 75%, 0.75. The equivalence lands because nothing physical changed.',
    R => {
      const d = R.pick([2, 4, 5, 8, 10, 4, 5, 10]), n = R.int(1, d - 1), x = n / d, who = R.pick(NAMES), food = R.pick(FOODS);
      const setup = fcBoard(), p = pct(x), ch = options(R, dec(x), [dec(1 - x), dec(n / 100), dec(x / 10), dec(x + 0.1)]);
      return {
        prompt: `${who} ate ${fr(n, d)} of a ${food}. Build ${fr(n, d)} with 1/${d} pieces. Switch Labels to Percent, then to Decimal. What percent is it, and which decimal?`,
        setup, answer: { board: [{ t: 'circle', counts: { [d]: n }, say: `Build ${fr(n, d)} with 1/${d} pieces in one circle.` }, { t: 'mode', modes: ['pct', 'dec'], say: 'Switch Labels under the board to Percent or Decimal.' }],
          box: { key: p, keys: [p, `${p}%`], label: 'percent' }, choice: { ...ch, say: 'Switch Labels to Decimal and look at the pieces.' } },
        hints: [`Build ${fr(n, d)}: ${pieces(n, d)}. Then change Labels to Percent.`, `Each 1/${d} piece is ${pct(1 / d)}%. Add up ${n} of them.`, `${fr(n, d)} = ${p}% = ${dec(x)}.`],
        explain: `${fr(n, d)}, ${p}% and ${dec(x)} name the same amount: the pieces did not change, only their labels.`,
        solution: { board: solved(setup, [of(n, d)], { mode: 'dec' }), box: p, choice: ch.correct },
      };
    }, false),
  T('rings-equivalence', 'Rings equivalence', '4.NF.A.1', '4',
    'Open the Rings view. Find where a fraction ends and the fraction in another ring that ends on the same line. Type the missing number.',
    'Aligned edges on the rings are equivalences. 1/2 = 3/6 = 6/12 is usually found first; push for one with eighths.',
    R => {
      const [b, D] = R.pick(MULTS), a = R.int(1, b - 1), k = (a * D) / b, fwd = R.chance();
      const setup = fcBoard();
      return {
        prompt: fwd ? `Open the Rings view. In the ring for 1/${b}, ${fr(a, b)} ends on a line. It is the same line as ?/${D} in the ring for 1/${D}. What is the missing number?`
          : `Open the Rings view. In the ring for 1/${D}, ${fr(k, D)} ends on a line. It is the same line as ?/${b} in the ring for 1/${b}. What is the missing number?`,
        setup, answer: { board: [{ t: 'rings', on: true, say: 'Tap Rings view in the palette.' }], box: { key: String(fwd ? k : a), label: 'the missing number' } },
        hints: ['Tap Rings view in the palette. Each ring is one piece size.', fwd ? `Count ${plural(a, 'part')} of the 1/${b} ring from the top, going clockwise. Follow that line to the 1/${D} ring.` : `Count ${plural(k, 'part')} of the 1/${D} ring from the top, going clockwise. Follow that line to the 1/${b} ring.`, `${fr(a, b)} = ${fr(k, D)}. The missing number is ${fwd ? k : a}.`],
        explain: `${fr(a, b)} = ${fr(k, D)}: each 1/${b} part is ${D / b} parts of 1/${D}, so they end on the same line.`,
        solution: { board: solved(setup, [[]], { rings: true }), box: String(fwd ? k : a) },
      };
    }),
  T('thirds-and-ninths-talk', 'Thirds and ninths talk', '4.NF.A.1', '4',
    'Predict how many small pieces, like ninths, cover a fraction made of bigger pieces, like 1/3. Test it with one circle for each.',
    'Three ninths cover a third. Ask for the prediction before any ninths come out, then put 1/3 in one circle and 3/9 in the next to check that they end on the same line.',
    R => {
      const [u, f] = R.chance(0.3) ? [3, 9] : R.pick(MULTS), k = R.int(1, u), m = (k * f) / u;
      const setup = fcBoard();
      return {
        prompt: `Predict first: how many 1/${f} pieces cover ${fr(k, u)}? Then test it: show ${fr(k, u)} in one circle and the 1/${f} pieces in a new circle.`,
        setup, answer: { board: [{ t: 'circles', list: [{ counts: { [u]: k } }, { counts: { [f]: m } }], say: `Show ${fr(k, u)} with 1/${u} pieces, then the same amount with 1/${f} pieces in a new circle.` }], box: { key: String(m), label: `1/${f} pieces` } },
        hints: [`Show ${fr(k, u)}: ${pieces(k, u)} in the first circle.`, `Tap New circle. Add 1/${f} pieces until it is covered as much as the first circle.`, `One 1/${u} piece is ${f / u} pieces of 1/${f}. ${k} × ${f / u} = ${m}.`],
        explain: `${fr(k, u)} = ${fr(m, f)}. Each 1/${u} piece is covered exactly by ${f / u} pieces of 1/${f}.`,
        solution: { board: solved(setup, [of(k, u), of(m, f)]), box: String(m) },
      };
    }),
  T('more-than-a-whole', 'More than a whole', '4.NF.B.3b', '4',
    'Build a fraction greater than 1, like 5/4, with one piece size: a full circle, then a second circle. Pick the mixed number.',
    'Five quarters need a second circle, which is exactly why mixed numbers exist. Name 1 and 1/4 after building.',
    R => {
      const d = R.pick([2, 3, 4, 4, 5, 6, 8, 10, 12]), top = d <= 4 ? 3 * d - 1 : d + 5;
      let n = R.int(d + 1, top); if (n % d === 0) n += 1;
      const w = Math.floor(n / d), r = n % d, setup = fcBoard();
      const right = `${w} ${fr(r, d)}`, ch = options(R, right, [`${w + 1} ${fr(r, d)}`, d - r !== r ? `${w} ${fr(d - r, d)}` : '', `${w} ${fr(r, n)}`, `${r} ${fr(w, d)}`]);
      return {
        prompt: `Build ${fr(n, d)} with 1/${d} pieces. When a circle is full, the next pieces go into a new circle. Which mixed number is ${fr(n, d)}?`,
        setup, answer: { board: [{ t: 'total', u: n * U(d), only: [d], say: `Use ${pieces(n, d)} in all, and only 1/${d} pieces.` }], choice: { ...ch, say: 'Count the full circles, then the pieces in the last one.' } },
        hints: [`Tap the 1/${d} piece ${n} times.`, `${d} pieces of 1/${d} fill a circle: that is 1 whole.`, `${n} = ${w > 1 ? `${w} × ${d}` : d} + ${r}, so ${fr(n, d)} = ${right}.`],
        explain: `${fr(n, d)} = ${right}: ${w === 1 ? 'one full circle' : `${w} full circles`} and ${fr(r, d)} more.`,
        solution: { board: solved(setup, [...Array.from({ length: w }, () => of(d, d)), of(r, d)]), choice: ch.correct },
      };
    }, false),
  T('compare-to-a-half', 'Compare to a half', '3.NF.A.3d', '3',
    'Build a fraction in a circle. Is it less than, equal to, or more than half a circle?',
    'Only the whole and halves reach a half; every other single piece is less. The sorting makes the benchmark physical.',
    R => {
      const d = R.pick([2, 3, 4, 6, 8, 12]), n = R.int(1, d - 1), c = 2 * n < d ? 0 : 2 * n === d ? 1 : 2, setup = fcBoard();
      const opts = ['Less than 1/2', 'Equal to 1/2', 'More than 1/2'];
      return {
        prompt: `Show ${fr(n, d)} in a circle. Is ${fr(n, d)} less than, equal to, or more than 1/2 of the circle?`,
        setup, answer: { board: [{ t: 'circle', counts: { [d]: n }, say: `Show ${fr(n, d)} with 1/${d} pieces.` }], choice: { options: opts, correct: c, say: 'Does the covered part reach halfway around the circle?' } },
        hints: [`Put ${pieces(n, d)} in the circle.`, d % 2 ? `Half the circle would be ${(d - 1) / 2} and a half pieces of 1/${d}.` : `Half the circle is ${pieces(d / 2, d)}.`, `${plural(n, 'piece')} is ${['less than', 'the same as', 'more than'][c]} half of ${d} pieces, so ${fr(n, d)} is ${opts[c].toLowerCase()}.`],
        explain: `${fr(n, d)} is ${opts[c].toLowerCase()}: ${c === 1 ? 'it covers exactly half the circle' : `it covers ${c ? 'more' : 'less'} than halfway around the circle`}.`,
        solution: { board: solved(setup, [of(n, d)]), choice: c },
      };
    }),
  T('add-unlike-pieces', 'Add unlike pieces', '5.NF.A.1', '5',
    'Add two fractions with different pieces, like 1/2 + 1/4, in one circle. Cover the same amount with one piece size in a second circle and type the sum.',
    'The sum is 3/4, found by trading the half for two quarters. Trading to a common size is the seed of common denominators.',
    R => {
      const pairs = []; for (const b of DENS) for (const d of DENS) if (b < d && DENS.includes(lcm(b, d))) pairs.push([b, d]);
      let b, d, a, c, L;
      for (;;) { [b, d] = R.pick(pairs); L = lcm(b, d); a = R.int(1, b - 1); c = R.int(1, d - 1); if (a * (L / b) + c * (L / d) <= L) break; }
      const k = a * (L / b) + c * (L / d), setup = fcBoard();
      return {
        prompt: `Show ${fr(a, b)} + ${fr(c, d)} in one circle. In a new circle, cover the same amount using only 1/${L} pieces. What is ${fr(a, b)} + ${fr(c, d)}?`,
        setup, answer: { board: [{ t: 'circles', list: [{ counts: { [b]: a, [d]: c } }, { counts: { [L]: k } }], say: `Put ${fr(a, b)} and ${fr(c, d)} in one circle, and the same amount in 1/${L} pieces in a new circle.` }], box: { key: fr(k, L), label: 'the sum' } },
        hints: [`Circle 1: ${pieces(a, b)} and ${pieces(c, d)}.`, `Tap New circle. Each 1/${b} piece is ${L / b} pieces of 1/${L}${L !== d ? `, each 1/${d} piece is ${L / d}` : ''}.`, `${fr(a, b)} + ${fr(c, d)} = ${fr(a * (L / b), L)} + ${fr(c * (L / d), L)} = ${fr(k, L)}.`],
        explain: `${fr(a, b)} + ${fr(c, d)} = ${fr(k, L)}${mixed(k, L) !== fr(k, L) ? ` = ${mixed(k, L)}` : ''}. With one piece size you can count the pieces to name the sum exactly.`,
        solution: { board: solved(setup, [[...of(a, b), ...of(c, d)], of(k, L)]), box: fr(k, L) },
      };
    }, false),
  T('percent-pie', 'Percent pie', '6.RP.A.3c', '6',
    'Cover a percent of a circle with pieces of one size. Switch labels to decimal and type the decimal; pick the fraction.',
    '40 percent is 2/5 or 0.4. Switching labels on an unchanged cover is the strongest equivalence demonstration.',
    R => {
      const [p, d] = R.pick([[10, 10], [20, 5], [30, 10], [40, 5], [60, 5], [70, 10], [80, 5], [90, 10], [25, 4], [50, 2], [75, 4], [12.5, 8], [37.5, 8], [62.5, 8], [87.5, 8]]);
      const n = Math.round((p / 100) * d), who = R.pick(NAMES), what = R.pick(['a spinner', 'a pie chart', 'a garden bed', 'a round poster', 'a plate', 'a clock face']), x = p / 100;
      const g = gcd(n, d), right = fr(n / g, d / g), ch = options(R, right, [fr(d / g - n / g, d / g), n / g + 1 < d / g ? fr(n / g + 1, d / g) : '', fr(n / g, d / g + 1)]);
      const setup = fcBoard();
      return {
        prompt: `${who} colored ${p}% of ${what}. Cover ${p}% of a circle with pieces of one size, then switch Labels to Decimal. What decimal is ${p}%, and which fraction?`,
        setup, answer: { board: [{ t: 'circle', u: Math.round(x * FC_WHOLE), one: true, say: `Cover ${p}% of one circle with pieces of one size.` }, { t: 'mode', modes: ['dec'], say: 'Switch Labels under the board to Decimal.' }],
          box: { key: dec(x), label: 'the decimal' }, choice: { ...ch, say: `How many pieces make ${p}%, and what size are they?` } },
        hints: [`Switch Labels to Percent first: find the piece that shows ${pct(1 / d)}%.`, `${n} of those pieces make ${p}%. Then switch Labels to Decimal.`, `${p}% = ${dec(x)} = ${right}.`],
        explain: `${p}% = ${dec(x)} = ${right}. The cover stays the same; only its name changes.`,
        solution: { board: solved(setup, [of(n, d)], { mode: 'dec' }), box: dec(x), choice: ch.correct },
      };
    }, false),
  T('eighths-exploration', 'Eighths exploration', '4.NF.B.3a', '4',
    'Add three amounts of eighths, one after another. How far past one whole do you go?',
    'The total reaches 8/8 exactly at the end, passing through 5/8. Counting in eighths aloud builds fraction fluency.',
    R => {
      let a, b, c; do { a = R.int(1, 7); b = R.int(1, 7); c = R.int(1, 7); } while (a + b + c <= 8 || a + b + c > 15);
      const s = a + b + c, r = s - 8, setup = fcBoard();
      return {
        prompt: `Build ${fr(a, 8)}, then add ${fr(b, 8)}, then ${fr(c, 8)} more. You pass one whole. How much more than one whole is it?`,
        setup, answer: { board: [{ t: 'total', u: s * U(8), only: [8], say: `Add ${a}, then ${b}, then ${pieces(c, 8)}.` }], box: { key: fr(r, 8), label: 'more than one whole' } },
        hints: [`Tap the 1/8 piece ${a} times, then ${b} times, then ${c} times.`, `${a} + ${b} + ${c} = ${s} eighths. 8 of them fill the first circle.`, `${fr(s, 8)} = 1 and ${fr(r, 8)}. It is ${fr(r, 8)} more than one whole.`],
        explain: `${fr(a, 8)} + ${fr(b, 8)} + ${fr(c, 8)} = ${fr(s, 8)} = 1 ${fr(r, 8)}: one full circle and ${fr(r, 8)} more.`,
        solution: { board: solved(setup, [of(8, 8), of(r, 8)]), box: fr(r, 8) },
      };
    }, false),
  T('fraction-of-a-turn', 'Fraction of a turn', '4.MD.C.5', '4',
    'A piece is a fraction of a full turn. How many pieces of one size make a full turn, a half turn or a quarter turn? Fill that much of a circle.',
    'Fractions of a turn link fractions to angles: a quarter turn is 90 degrees, which children meet in geometry.',
    R => {
      const TURNS = [['a full turn', 1, ''], ['a half turn', 1 / 2, '1/2'], ['a quarter turn', 1 / 4, '1/4'], ['a three-quarter turn', 3 / 4, '3/4'], ['a third of a turn', 1 / 3, '1/3'], ['two-thirds of a turn', 2 / 3, '2/3']];
      const all = []; for (const d of [2, 3, 4, 5, 6, 8, 9, 10, 12]) for (const [nm, t, f] of TURNS) { const k = t * d; if (Math.abs(k - Math.round(k)) < 1e-9 && k >= 1) all.push([d, nm, t, Math.round(k), f]); }
      const [d, nm, t, k, f] = R.pick(all), thing = R.pick(['a spinner', 'a wheel', 'a dial']), setup = fcBoard();
      return {
        prompt: `Turn ${thing} by 1/${d} pieces. Each 1/${d} piece is 1/${d} of a full turn. How many 1/${d} pieces make ${nm}? Fill that much of a circle to check.`,
        setup, answer: { board: [{ t: 'circle', counts: { [d]: k }, say: `Fill ${nm} of one circle with 1/${d} pieces.` }], box: { key: String(k), label: `1/${d} pieces` } },
        hints: [`Add 1/${d} pieces one at a time. They go around from the top, clockwise.`, `A full turn is ${d} pieces of 1/${d}.${f ? ` ${nm[0].toUpperCase()}${nm.slice(1)} is ${f} of the ${d} pieces.` : ''}`, `${pieces(k, d)} ${k === 1 ? 'makes' : 'make'} ${nm}: ${k} × ${+(360 / d).toFixed(1)}° = ${+(t * 360).toFixed(1)}°.`],
        explain: `${nm[0].toUpperCase()}${nm.slice(1)} is ${+(t * 360).toFixed(1)}°. Each 1/${d} piece turns ${+(360 / d).toFixed(1)}°, so ${plural(k, 'piece')} ${k === 1 ? 'makes' : 'make'} it.`,
        solution: { board: solved(setup, [of(k, d)]), box: String(k) },
      };
    }),
  T('leftover-pieces', 'Leftover pieces', '4.NF.B.3', '4',
    'Put some pieces of one size in a circle. What fraction of the circle is not covered?',
    'Four fifths cover 4/5, leaving 1/5. Five fifths would be exact, so discuss why the leftover is what it is.',
    R => {
      const d = R.pick(DENS), k = R.int(1, d - 1), setup = fcBoard();
      return {
        prompt: `Put ${pieces(k, d)} in a circle, without going over a whole. What fraction of the circle is not covered?`,
        setup, answer: { board: [{ t: 'circle', counts: { [d]: k }, say: `Put ${pieces(k, d)} in one circle.` }], box: { key: fr(d - k, d), label: 'not covered' } },
        hints: [`Tap the 1/${d} piece ${k} times.`, `A whole circle is ${d} pieces of 1/${d}. How many more would fill it?`, `${d} - ${k} = ${d - k}, so ${fr(d - k, d)} is not covered.`],
        explain: `${fr(k, d)} + ${fr(d - k, d)} = 1 whole, so ${fr(d - k, d)} is left uncovered.`,
        solution: { board: solved(setup, [of(k, d)]), box: fr(d - k, d) },
      };
    }, false),
  T('order-the-pieces', 'Order the pieces', '3.NF.A.3d', '3',
    'Put one piece of each of three sizes in its own circle. Which piece is the biggest, or the smallest?',
    'Bigger denominator, smaller piece, because the whole is cut into more parts. Saying the why matters more than the order.',
    R => {
      const ds = R.shuffle([2, 3, 4, 6, 8]).slice(0, 3), big = R.chance(), ans = big ? Math.min(...ds) : Math.max(...ds), which = big ? 'biggest' : 'smallest';
      const opts = ds.map(d => `1/${d}`), setup = fcBoard();
      return {
        prompt: `Put a 1/${ds[0]}, a 1/${ds[1]} and a 1/${ds[2]} piece each in its own circle. Which piece is the ${which}?`,
        setup, answer: { board: [{ t: 'circles', list: ds.map(d => ({ counts: { [d]: 1 } })), say: 'Put each piece alone in its own circle: tap New circle before the next piece.' }],
          choice: { options: opts, correct: ds.indexOf(ans), say: 'Look at how much of each circle is covered.' } },
        hints: ['Tap New circle before each new piece, so each piece has its own circle.', 'Compare how much of each circle each piece covers.', `The more pieces it takes to make a whole, the smaller each piece. 1/${ans} is the ${which}.`],
        explain: `1/${ans} is the ${which}. From biggest to smallest: ${[...ds].sort((x, y) => x - y).map(d => `1/${d}`).join(', ')}.`,
        solution: { board: solved(setup, ds.map(d => [d])), choice: ds.indexOf(ans) },
      };
    }),
  T('twelfths-clock', 'Twelfths clock', '3.MD.A.1', '3',
    'A circle is a clock face and each twelfth is 5 minutes. Show a number of minutes with twelfths pieces. How many pieces?',
    'Twelfths are clock fractions: each piece is 5 minutes. This connects two tools children already know separately.',
    R => {
      const m = 5 * R.int(1, 11), what = R.pick(['Recess lasts', 'The bus ride takes', 'Reading time is', 'Art class lasts', 'The walk home takes', 'Lunch lasts', 'The game lasts', 'Music practice is']);
      const k = m / 5, setup = fcBoard();
      return {
        prompt: `The circle is a clock face: each 1/12 piece is 5 minutes. ${what} ${m} minutes. Show ${m} minutes with 1/12 pieces. How many pieces did you use?`,
        setup, answer: { board: [{ t: 'circle', counts: { 12: k }, say: `Show ${m} minutes with 1/12 pieces in one circle.` }], box: { key: String(k), label: '1/12 pieces' } },
        hints: ['Each 1/12 piece is 5 minutes, like the space between two numbers on a clock.', `Count by fives as you add pieces: 5, 10, 15, ... up to ${m}.`, `${m} ÷ 5 = ${plural(k, 'piece')}.`],
        explain: `${plural(k, 'piece')} of 5 minutes ${k === 1 ? 'makes' : 'make'} ${m} minutes: ${fr(k, 12)} of an hour.`,
        solution: { board: solved(setup, [of(k, 12)]), box: String(k) },
      };
    }, false),
  T('equivalent-cover', 'Equivalent cover', '4.NF.A.1', '4',
    'Cover a fraction of a circle, then cover the same amount in a second circle with smaller pieces of one size. Type the missing number of the equivalence.',
    '2/3 equals 4/6, visible as an exact cover. Require edges to align before accepting the equivalence.',
    R => {
      const [b, D] = R.pick(MULTS.filter(([, x]) => x !== 9)), a = R.int(1, b - 1), k = (a * D) / b, food = R.pick(FOODS), who = R.pick(NAMES);
      const setup = fcBoard();
      return {
        prompt: `${who} ate ${fr(a, b)} of a ${food}. Cover ${fr(a, b)} of a circle with 1/${b} pieces. In a new circle, cover the same amount with 1/${D} pieces only. ${fr(a, b)} = ?/${D}`,
        setup, answer: { board: [{ t: 'circles', list: [{ counts: { [b]: a } }, { counts: { [D]: k } }], say: `Show ${fr(a, b)} with 1/${b} pieces, then the same amount with 1/${D} pieces in a new circle.` }], box: { key: fr(a, b), over: D, label: `?/${D}` } },
        hints: [`Circle 1: ${pieces(a, b)}. Then tap New circle.`, `Add 1/${D} pieces until the new circle is covered as much as the first. The edges line up.`, `${fr(a, b)} = ${fr(k, D)}. The missing number is ${k}.`],
        explain: `${fr(a, b)} = ${fr(k, D)}: each 1/${b} piece is exactly ${D / b} pieces of 1/${D}.`,
        solution: { board: solved(setup, [of(a, b), of(k, D)]), box: String(k) },
      };
    }, false),
  T('decimal-switch-challenge', 'Decimal switch challenge', '5.NBT.A.3', '5',
    'A partner describes an amount as a decimal. Switch labels to decimal, build the amount, and pick the fraction for it.',
    'Rebuilding from a description tests whether the decimal truly names the same amount as the pieces.',
    R => {
      const VALS = []; for (const d of [2, 4, 5, 8, 10]) for (let n = 1; n < d; n++) if (gcd(n, d) === 1) VALS.push([n, d]);
      const [n, d] = R.pick(VALS), w = R.chance(0.4) ? 1 : 0, x = w + n / d, who = R.pick(NAMES), setup = fcBoard();
      const right = mixed(w * d + n, d), ch = options(R, right, [mixed(w * d + (d - n), d), `${w ? `${w} ` : ''}${n}/${d * 10}`, mixed((w + 1) * d + n, d)].filter(o => o !== right));
      return {
        prompt: `${who} says: "My amount is ${dec(x)} of a circle${w ? ' (more than one whole)' : ''}." Switch Labels to Decimal and build ${dec(x)}. Which fraction is the same amount?`,
        setup, answer: { board: [{ t: 'total', u: Math.round(x * FC_WHOLE), say: `Build ${dec(x)} in all.` }, { t: 'mode', modes: ['dec'], say: 'Switch Labels under the board to Decimal.' }],
          choice: { ...ch, say: 'Look at the pieces you used: how many, and what size?' } },
        hints: ['Switch Labels to Decimal. Each piece in the palette now shows its decimal.', `${w ? 'Use the whole piece (1.0) for the 1, then ' : ''}${plural(n, `piece of ${dec(1 / d)}`, `pieces of ${dec(1 / d)}`)} ${n === 1 ? 'makes' : 'make'} ${dec(n / d)}.`, `${dec(x)} = ${right}.`],
        explain: `${dec(x)} = ${right}. ${w ? 'One whole and ' : ''}${pieces(n, d)}, each ${dec(1 / d)}.`,
        solution: { board: solved(setup, [...(w ? [[1]] : []), of(n, d)], { mode: 'dec' }), choice: ch.correct },
      };
    }, false),
  T('half-and-quarter-mix', 'Mix two piece sizes', '4.NF.B.3d', '4',
    'Cover a whole using only halves and quarters (or two other sizes), a different way in each circle. How many different ways are there in all?',
    'Possibilities include 1/2 + 1/4 + 1/4 and four quarters. Systematic searching can be modeled by fixing the number of halves first.',
    R => {
      const [b, s] = R.pick([[2, 4], [2, 4], [2, 6], [2, 8], [3, 6], [3, 12], [4, 8], [2, 10], [5, 10], [6, 12], [4, 12], [2, 12], [3, 9]]), k = R.int(2, 3);
      const food = R.pick(['pizzas', 'pies', 'cakes', 'tortillas']), setup = fcBoard();
      const ways = Array.from({ length: k }, (_, j) => [...of(b - j, b), ...of((j * s) / b, s)]);
      return {
        prompt: `Cover ${k} circles (${k} ${food}), each one whole, using only 1/${b} and 1/${s} pieces. Make each circle a different way. How many different ways are there in all?`,
        setup, answer: { board: [{ t: 'ways', n: k, dens: [b, s], say: `Fill ${k} circles, each with a different mix of 1/${b} and 1/${s} pieces.` }], box: { key: String(b + 1), label: 'ways in all' } },
        hints: [`Start with ${pieces(b, b)}: that is one way. Tap New circle for the next way.`, `Use one fewer 1/${b} piece each time and fill the rest with 1/${s} pieces.`, `You can use ${b}, ${b - 1}, ... or 0 pieces of 1/${b}: that is ${b + 1} ways.`],
        explain: `Fixing how many 1/${b} pieces you use (from ${b} down to 0) finds every way: ${b + 1} ways in all.`,
        solution: { board: solved(setup, ways), box: String(b + 1) },
      };
    }),
];
