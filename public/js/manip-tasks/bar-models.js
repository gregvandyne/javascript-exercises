// Bar Models: the tool's 17 tasks as practice (docs/manip-practice-tasks.md). As in rekenreks.js: each task keeps its
// title, code, grade and notes; make(R) gives one variation from a seeded random source; conds are this tool's board
// checks, read from the board's bar models (bars by name, each part's typed value). A practice bar model starts with its
// bars named and its parts labeled, every part to find at 1; the student types (or steps) each part's value, adds parts
// where the task asks for equal parts, and types the answer. Every variation hides the bars' totals.
import { boardWith, rowPlaces, objSizeOf } from '../manip-task-kit.js';

export const SLUG = 'bar-models';
const C = ['#7CB342', '#1E88E5', '#FB8C00', '#8E24AA', '#00897B', '#C0CA33'];
const NAMES = ['Sam', 'Jo', 'Mia', 'Leo', 'Ava', 'Eli', 'Nia', 'Omar', 'Zoe', 'Ben'];
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
/** A bar model's state: bars [[name, [[label, value?], ...]], ...] (a part with no value starts at 1). */
const barSt = bars => ({ bars: bars.map(([name, segs], i) => ({ name, segs: segs.map(([label, value], j) => ({ label, value: value === undefined ? 1 : value, color: C[(i + j) % C.length] })) })) });
/** A board with one bar model of these bars. */
export function barBoard(bars) {
  const st = barSt(bars), [at] = rowPlaces([objSizeOf(SLUG, SLUG, st)]);
  return boardWith(SLUG, [{ id: 'b1', k: SLUG, x: at.x, y: at.y, s: 1, st, locked: true }]);
}
/** The same board with these bars' parts set: { name: [values] } (more values than parts: parts added, labeled like the first). */
function solved(setup, vals) {
  const b = JSON.parse(JSON.stringify(setup)), st = b.objects[0].st;
  for (const [name, vs] of Object.entries(vals)) {
    const bar = st.bars.find(x => x.name === name);
    while (bar.segs.length < vs.length) bar.segs.push({ label: 'Part', value: 1, color: '#C0CA33' });
    vs.forEach((v, i) => { bar.segs[i].value = v; });
  }
  return b;
}

// ---------------------------------------------------------------- the checks
/** Every bar of the board's bar models (not read-only ones): [{ name, values }]. */
const barsOf = b => ((b && Array.isArray(b.objects)) ? b.objects : []).filter(o => o && o.k === SLUG && o.st && !o.st.q && Array.isArray(o.st.bars))
  .flatMap(o => o.st.bars.filter(x => x && Array.isArray(x.segs)).map(x => ({ name: String(x.name || ''), values: x.segs.filter(s => s && typeof s === 'object').map(s => num(s.value, NaN)) })));
const barOf = (c, b) => barsOf(b).find(x => x.name === c.bar) || null;
const same = (x, y) => Math.abs(x - y) < 1e-6;
export const conds = {
  /** The bar's parts have exactly these values, in this order (any: in any order). */
  segs: (c, b) => {
    const x = barOf(c, b); if (!x || x.values.length !== c.values.length) return false;
    if (!c.any) return x.values.every((v, i) => same(v, c.values[i]));
    const a = [...x.values].sort((p, q) => p - q), w = [...c.values].sort((p, q) => p - q); return a.every((v, i) => same(v, w[i]));
  },
  /** The bar adds up to n. */
  total: (c, b) => { const x = barOf(c, b); return !!x && same(x.values.reduce((s, v) => s + v, 0), c.n); },
  /** The bar has n equal parts of v each. */
  equal: (c, b) => { const x = barOf(c, b); return !!x && x.values.length === c.n && x.values.every(v => same(v, c.v)); },
};

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
const typeIt = 'Tap a part\'s number and type its value (or use - and +).';
const money = n => `$${n}`;
const parts = n => `${n} equal ${n === 1 ? 'part' : 'parts'}`;

export const TASKS = [
  T('part-part-whole-pets', 'Part-part-whole: pets', '2.OA.A.1', '2',
    'Model a story with a whole and two parts: the whole and one part are known. Set the parts on the bar, then find the unknown part.',
    'Drawing the bar before computing is the discipline. The unknown segment gets a question mark label, not a guessed number.',
    R => {
      const [all, one, two] = R.pick([['pets', 'Dogs', 'Cats'], ['pieces of fruit', 'Apples', 'Pears'], ['books', 'Stories', 'Comics'], ['shells', 'White', 'Pink'], ['cars', 'Red', 'Blue'], ['balls', 'Soccer', 'Tennis']]);
      const W = R.int(20, 99), a = R.int(5, W - 5), u = W - a;
      const setup = barBoard([['Whole', [[`All ${all}`, W]]], ['Parts', [[one], [two]]]]);
      return {
        prompt: `There are ${W} ${all}. ${a} are ${one.toLowerCase()}, the rest are ${two.toLowerCase()}. Set ${one} and ${two} on the Parts bar so it matches the Whole bar. How many are ${two.toLowerCase()}?`,
        setup, answer: { board: [{ t: 'segs', bar: 'Parts', values: [a, u], say: `Set ${one} to ${a}, then make ${two} fill the rest of ${W}.` }, { t: 'segs', bar: 'Whole', values: [W], say: `Keep the Whole bar at ${W}.` }], box: { key: String(u), label: two.toLowerCase() } },
        hints: [`${typeIt} Set ${one} to ${a}.`, `${two} is the rest: ${a} + ? = ${W}.`, `${W} - ${a} = ${u}. Set ${two} to ${u}.`],
        explain: `${a} + ${u} = ${W}, so ${u} are ${two.toLowerCase()}. The two parts together are as long as the whole.`,
        solution: { board: solved(setup, { Parts: [a, u] }), box: String(u) },
      };
    }),
  T('comparison-bars', 'Comparison bars', '3.OA.D.8', '3',
    'One person has some more than another, and you know the total. Build comparison bars and find how many each has.',
    'The extra segment of 6 is the key insight: remove it, halve 20, then add back. Bars make that move obvious.',
    R => {
      const [x, y] = R.shuffle(NAMES).slice(0, 2), thing = R.pick(['marbles', 'stickers', 'cards', 'shells', 'stamps']);
      const j = R.int(4, 30), d = R.int(2, 12), s = j + d, tot = s + j;
      const setup = barBoard([[x, [[`Same as ${y}`], ['Extra']]], [y, [[y]]]]);
      return {
        prompt: `${x} has ${d} more ${thing} than ${y}. Together they have ${tot}. Set the bars: ${y}'s bar, and ${x}'s bar as the same plus the extra ${d}. How many ${thing} does ${x} have?`,
        setup, answer: { board: [{ t: 'segs', bar: x, values: [j, d], say: `${x}'s bar: the same as ${y}, then the extra ${d}.` }, { t: 'segs', bar: y, values: [j], say: `Set ${y}'s bar so both bars make ${tot} together.` }], box: { key: String(s), label: `${x}'s ${thing}` } },
        hints: [`Set Extra on ${x}'s bar to ${d}.`, `Take away the extra: ${tot} - ${d} = ${tot - d}. That is two equal parts, one for each.`, `${tot - d} ÷ 2 = ${j}, so ${y} has ${j} and ${x} has ${j} + ${d} = ${s}.`],
        explain: `${y} has ${j} and ${x} has ${s}: ${s} + ${j} = ${tot}, and ${s} is ${d} more than ${j}.`,
        solution: { board: solved(setup, { [x]: [j, d], [y]: [j] }), box: String(s) },
      };
    }),
  T('ratio-bars', 'Ratio bars', '6.RP.A.3', '6',
    'A mix has two things in a ratio, like juice and water 2:3. Build each bar in equal parts and scale it to a total. How much of the first thing?',
    'Each part must stay equal as the bar scales. When the total is 25, one part is worth 5, so the mix is 10 juice to 15 water.',
    R => {
      let a, b; do { a = R.int(1, 5); b = R.int(1, 5); } while (a === b || gcd(a, b) !== 1);
      const [one, two] = R.pick([['Juice', 'Water'], ['Red paint', 'White paint'], ['Sand', 'Cement'], ['Flour', 'Sugar'], ['Boys', 'Girls']]);
      const k = R.int(2, 12), tot = k * (a + b), setup = barBoard([[one, [['Part']]], [two, [['Part']]]]);
      return {
        prompt: `${one} and ${two.toLowerCase()} are in the ratio ${a}:${b}. The total is ${tot}. Give the ${one} bar ${parts(a)} and the ${two} bar ${parts(b)}, and set each part's value. How much is ${one.toLowerCase()}?`,
        setup, answer: { board: [{ t: 'equal', bar: one, n: a, v: k, say: `The ${one} bar needs ${parts(a)}.` }, { t: 'equal', bar: two, n: b, v: k, say: `The ${two} bar needs ${parts(b)}, the same size as the ${one} parts.` }], box: { key: String(a * k), label: one.toLowerCase() } },
        hints: ['Tap a part to select it, then Add a part puts a new part on that bar.', `There are ${a} + ${b} = ${a + b} equal parts in all. ${tot} ÷ ${a + b} = ${k}: each part is ${k}.`, `${one}: ${a} × ${k} = ${a * k}.`],
        explain: `Each part is ${tot} ÷ ${a + b} = ${k}, so ${one.toLowerCase()} is ${a} × ${k} = ${a * k} and ${two.toLowerCase()} is ${b} × ${k} = ${b * k}. Still ${a}:${b}.`,
        solution: { board: solved(setup, { [one]: Array(a).fill(k), [two]: Array(b).fill(k) }), box: String(a * k) },
      };
    }),
  T('fraction-of-a-bar', 'Fraction of a bar', '5.NF.B.4', '5',
    'A whole bar is split into equal parts. Set each part so the bar is the whole, then find a fraction of the whole.',
    'Unit fraction first (45 ÷ 5 = 9), then build up to 3 parts = 27. The bar shows why the two-step method works.',
    R => {
      const n = R.int(3, 5), u = R.int(2, 15), W = n * u, a = R.int(1, n - 1);
      const setup = barBoard([['Whole', Array.from({ length: n }, (_, i) => [`1/${n}`])]]);
      return {
        prompt: `The bar is split into ${n} equal parts and the whole is ${W}. Type each part's value. What is ${a}/${n} of ${W}?`,
        setup, answer: { board: [{ t: 'equal', bar: 'Whole', n, v: u, say: `Every part is the same, and the ${n} parts make ${W}.` }], box: { key: String(a * u), label: `${a}/${n} of ${W}` } },
        hints: [`${typeIt} All ${n} parts are equal.`, `One part is ${W} ÷ ${n} = ${u}.`, `${a} parts: ${a} × ${u} = ${a * u}.`],
        explain: `1/${n} of ${W} is ${u}, so ${a}/${n} of ${W} is ${a} × ${u} = ${a * u}.`,
        solution: { board: solved(setup, { Whole: Array(n).fill(u) }), box: String(a * u) },
      };
    }),
  T('two-step-bar', 'Two-step bar', '3.OA.D.8', '3',
    'One color has some, another color has a few times as many. Build both bars and find the total.',
    'The blue bar is two units of 15, total 45. Two-step problems need the hidden step found first, and the bar exposes it.',
    R => {
      const r = R.int(4, 25), m = R.int(2, 3), [thing, c1, c2] = R.pick([['pens', 'Red', 'Blue'], ['stickers', 'Star', 'Heart'], ['beads', 'Green', 'Yellow'], ['cards', 'Small', 'Big'], ['apples', 'Red', 'Green']]);
      const times = m === 2 ? 'twice as many' : 'three times as many', setup = barBoard([[c1, [[c1]]], [c2, Array.from({ length: m }, () => [c2])]]);
      return {
        prompt: `A shop has ${r} ${c1.toLowerCase()} ${thing} and ${times} ${c2.toLowerCase()} ${thing}. Set both bars (each ${c2} part is as long as the ${c1} bar). How many ${thing} in all?`,
        setup, answer: { board: [{ t: 'segs', bar: c1, values: [r], say: `Set the ${c1} bar to ${r}.` }, { t: 'equal', bar: c2, n: m, v: r, say: `Each ${c2} part is ${r}.` }], box: { key: String(r * (m + 1)), label: 'in all' } },
        hints: [`${typeIt} The ${c1} bar is ${r}.`, `${c2}: ${m} parts of ${r} = ${m * r}.`, `${r} + ${m * r} = ${r * (m + 1)}.`],
        explain: `${c2} ${thing}: ${m} × ${r} = ${m * r}. In all: ${r} + ${m * r} = ${r * (m + 1)}.`,
        solution: { board: solved(setup, { [c1]: [r], [c2]: Array(m).fill(r) }), box: String(r * (m + 1)) },
      };
    }),
  T('fraction-bar-leftovers', 'Fraction bar: leftovers', '4.NF.B.3', '4',
    'A food is cut into equal slices and some are eaten. Set the bar to the slices eaten and left, then type the fraction left.',
    'The bar splits into 8 equal parts; eaten 3/8, left 5/8. Equal parts are non-negotiable for fraction bars.',
    R => {
      const d = R.int(4, 12), e = R.int(1, d - 1), food = R.pick(['pizza', 'pie', 'cake', 'pan of lasagna', 'loaf of bread']);
      const setup = barBoard([[`Whole ${food}`, [['Eaten'], ['Left']]]]);
      return {
        prompt: `A whole ${food} has ${d} equal slices and ${e} are eaten. Set Eaten and Left on the bar in slices. What fraction of the ${food} is left?`,
        setup, answer: { board: [{ t: 'segs', bar: `Whole ${food}`, values: [e, d - e], say: `Eaten is ${e} slices; Left is the rest of the ${d}.` }], box: { key: `${d - e}/${d}`, label: 'fraction left' } },
        hints: [`${typeIt} Eaten is ${e}.`, `Left is the rest: ${d} - ${e} = ${d - e} slices.`, `${d - e} of ${d} equal slices: ${d - e}/${d}.`],
        explain: `${e}/${d} eaten and ${d - e}/${d} left make ${d}/${d}, the whole ${food}.`,
        solution: { board: solved(setup, { [`Whole ${food}`]: [e, d - e] }), box: `${d - e}/${d}` },
      };
    }),
  T('comparison-difference', 'Comparison difference', '2.OA.A.1', '2',
    'Build two bars with their left edges lined up and mark the difference. What is the difference, and which equation finds it?',
    'Aligning left edges makes the difference a visible segment: 42 - 27 = 15. Comparison bars beat key-word hunting.',
    R => {
      const a = R.int(25, 99), b = R.int(10, a - 3), d = a - b, setup = barBoard([['A', [['A']]], ['B', [['B'], ['Difference']]]]);
      const eq = [`${a} - ${b}`, `${a} + ${b}`, `${b} - ${a}`], ch = R.shuffle(eq);
      return {
        prompt: `Bar A is ${a} and bar B is ${b}. Set bar A, then set bar B with a Difference part so both bars are as long. What is the difference, and which equation finds it?`,
        setup, answer: { board: [{ t: 'segs', bar: 'A', values: [a], say: `Set bar A to ${a}.` }, { t: 'segs', bar: 'B', values: [b, d], say: `Set B to ${b} and the Difference so bar B is as long as bar A.` }], box: { key: String(d), label: 'the difference' },
          choice: { options: ch, correct: ch.indexOf(eq[0]), say: 'The difference is what is left when you take the smaller from the bigger.' } },
        hints: [`${typeIt} A is ${a}, B is ${b}.`, `The Difference fills bar B up to ${a}: ${b} + ? = ${a}.`, `${a} - ${b} = ${d}.`],
        explain: `${a} - ${b} = ${d}: with the left edges lined up, the Difference is the part of A that B does not reach.`,
        solution: { board: solved(setup, { A: [a], B: [b, d] }), box: String(d), choice: ch.indexOf(eq[0]) },
      };
    }),
  T('ratio-scale-up', 'Ratio scale up', '6.RP.A.3', '6',
    'A mix is 1 part of one thing to some parts of another. Scale the bars up to a total. How much of the one part?',
    'Each part becomes 5, so juice is 5 and water 20. Scaling keeps the 1 to 4 relationship intact.',
    R => {
      const r = R.int(2, 5), k = R.int(2, 15), tot = k * (1 + r), [one, two] = R.pick([['Juice', 'Water'], ['Rice', 'Water'], ['Blue', 'Yellow'], ['Cocoa', 'Milk']]);
      const setup = barBoard([[one, [['Part']]], [two, Array.from({ length: r }, () => ['Part'])]]);
      return {
        prompt: `${one} to ${two.toLowerCase()} is 1 to ${r}. The total is ${tot}. Set every part so the parts stay equal and make ${tot} in all. How much ${one.toLowerCase()} is there?`,
        setup, answer: { board: [{ t: 'equal', bar: one, n: 1, v: k, say: `The ${one} bar is one part.` }, { t: 'equal', bar: two, n: r, v: k, say: `All ${r} parts of ${two} are the same size as the ${one} part.` }], box: { key: String(k), label: one.toLowerCase() } },
        hints: [`There are 1 + ${r} = ${1 + r} equal parts.`, `${tot} ÷ ${1 + r} = ${k}: every part is ${k}.`, `${one} is one part: ${k}. ${two} is ${r} × ${k} = ${r * k}.`],
        explain: `Each part is ${k}, so ${one.toLowerCase()} is ${k} and ${two.toLowerCase()} is ${r * k}: still 1 to ${r}, now ${k} to ${r * k}.`,
        solution: { board: solved(setup, { [one]: [k], [two]: Array(r).fill(k) }), box: String(k) },
      };
    }),
  T('money-bar', 'Money bar', '3.OA.A.1', '3',
    'You save the same amount each week. Build a bar with a part for each week and find the total saved.',
    'Equal segments of 12, six times, is multiplication as a bar. Labeling each segment prevents the common weeks-times mix-up.',
    R => {
      const s = R.int(2, 15), w = R.int(3, 5), who = R.pick(NAMES), setup = barBoard([['Savings', Array.from({ length: w }, (_, i) => [`Week ${i + 1}`])]]);
      return {
        prompt: `${who} saves ${money(s)} a week for ${w} weeks. Set each week's part on the Savings bar. How much is saved in all?`,
        setup, answer: { board: [{ t: 'equal', bar: 'Savings', n: w, v: s, say: `Each week's part is ${s}.` }], box: { key: money(s * w), label: 'saved in all' } },
        hints: [`${typeIt} Every week is ${s}.`, `${w} weeks of ${money(s)}: ${w} × ${s}.`, `${w} × ${s} = ${s * w}, so ${money(s * w)}.`],
        explain: `${w} equal parts of ${money(s)}: ${w} × ${s} = ${money(s * w)}.`,
        solution: { board: solved(setup, { Savings: Array(w).fill(s) }), box: money(s * w) },
      };
    }),
  T('unknown-start', 'Unknown start', '2.OA.A.1', '2',
    'After giving some away, you have some left. Build the bar with the start unknown and find how many you began with.',
    'Start-unknown problems are the hardest addition type. The bar shows the whole must be 14 + 9 = 23.',
    R => {
      const g = R.int(3, 40), l = R.int(3, 50), thing = R.pick(['stickers', 'marbles', 'crayons', 'stamps', 'beads']), setup = barBoard([['Start', [['Gave away'], ['Left']]]]);
      return {
        prompt: `After giving away ${g} ${thing}, you have ${l} left. Set Gave away and Left on the Start bar. How many ${thing} did you start with?`,
        setup, answer: { board: [{ t: 'segs', bar: 'Start', values: [g, l], say: `Set Gave away to ${g} and Left to ${l}.` }], box: { key: String(g + l), label: 'at the start' } },
        hints: [`${typeIt} Gave away is ${g}, Left is ${l}.`, 'The whole bar is the start: both parts together.', `${g} + ${l} = ${g + l}.`],
        explain: `${g} + ${l} = ${g + l}: the start is the whole bar, what you gave away and what is left.`,
        solution: { board: solved(setup, { Start: [g, l] }), box: String(g + l) },
      };
    }),
  T('percent-bar', 'Percent bar', '6.RP.A.3c', '6',
    'Build a percent bar for 100 percent with a shaded part, and an amount bar for the whole. What amount is shaded?',
    '30 percent of 50 is 15. A percent bar anchors percent to a whole of 100 first, then rescales.',
    R => {
      const p = R.chance(0.2) ? R.pick([25, 75]) : 10 * R.int(1, 9), W = p % 10 ? 4 * R.int(3, 25) : 10 * R.int(2, 20), sh = (p * W) / 100;
      const setup = barBoard([['Percent', [['Shaded'], ['Not shaded']]], ['Amount', [['Shaded'], ['Not shaded']]]]);
      return {
        prompt: `The whole is ${W}. Set the Percent bar to ${p}% shaded and ${100 - p}% not shaded. Then set the Amount bar for a whole of ${W}. What amount is shaded?`,
        setup, answer: { board: [{ t: 'segs', bar: 'Percent', values: [p, 100 - p], say: `The Percent bar is ${p} and ${100 - p}: 100 in all.` }, { t: 'segs', bar: 'Amount', values: [sh, W - sh], say: `The Amount bar's parts make ${W}, in the same split as the Percent bar.` }], box: { key: String(sh), label: 'shaded' } },
        hints: [`${typeIt} Percent bar: ${p} and ${100 - p}.`, `10% of ${W} is ${W / 10}. ${p}% is ${p / 10} of those.`, `${p}% of ${W} = ${sh}. Not shaded: ${W - sh}.`],
        explain: `${p}% of ${W} is ${sh}: the Amount bar is the Percent bar scaled from 100 to ${W}.`,
        solution: { board: solved(setup, { Percent: [p, 100 - p], Amount: [sh, W - sh] }), box: String(sh) },
      };
    }),
  T('groups-bar', 'Groups bar', '3.OA.B.6', '3',
    'Some boxes hold the same number each, with a total given. Build a part for each box and find how many in each.',
    'Five equal unknown segments totalling 30 gives 6 per box. This is division as finding an unknown factor.',
    R => {
      const b = R.int(3, 5), e = R.int(2, 10), [box, thing] = R.pick([['boxes', 'eggs'], ['bags', 'apples'], ['vases', 'flowers'], ['jars', 'cookies'], ['teams', 'players']]);
      const setup = barBoard([['Total', [['Part']]]]);
      return {
        prompt: `There are ${b} ${box} with the same number of ${thing}, ${b * e} ${thing} in all. Give the Total bar one part for each of the ${b} ${box}, and set the parts. How many ${thing} are in each?`,
        setup, answer: { board: [{ t: 'equal', bar: 'Total', n: b, v: e, say: `The bar needs ${b} equal parts that make ${b * e}.` }], box: { key: String(e), label: `${thing} in each` } },
        hints: [`Add a part until the bar has ${b} parts.`, `${b} equal parts make ${b * e}: ${b} × ? = ${b * e}.`, `${b * e} ÷ ${b} = ${e}. Set each part to ${e}.`],
        explain: `${b} × ${e} = ${b * e}, so each of the ${b} ${box} holds ${e}.`,
        solution: { board: solved(setup, { Total: Array(b).fill(e) }), box: String(e) },
      };
    }),
  T('change-bar', 'Change bar', '4.MD.A.2', '4',
    'A price is reduced by an amount. Model the change on the price bar and find the new price.',
    'A bar with a removed segment models reduction more clearly than a comparison pair here. New price 51 dollars.',
    R => {
      const P = R.int(30, 120), D = R.int(5, Math.floor(P / 2)), item = R.pick(['jacket', 'bike helmet', 'backpack', 'pair of shoes', 'board game']);
      const setup = barBoard([['Old price', [['New price'], ['Reduced by']]]]);
      return {
        prompt: `A ${item} costs ${money(P)} and is reduced by ${money(D)}. Set Reduced by and New price on the Old price bar. What is the new price?`,
        setup, answer: { board: [{ t: 'segs', bar: 'Old price', values: [P - D, D], say: `Reduced by is ${D}; the two parts make ${P}.` }], box: { key: money(P - D), label: 'new price' } },
        hints: [`${typeIt} Reduced by is ${D}.`, `The whole bar is the old price, ${money(P)}: New price + ${D} = ${P}.`, `${P} - ${D} = ${P - D}, so ${money(P - D)}.`],
        explain: `${money(P)} - ${money(D)} = ${money(P - D)}. The reduction is cut off the end of the old price.`,
        solution: { board: solved(setup, { 'Old price': [P - D, D] }), box: money(P - D) },
      };
    }),
  T('sum-and-difference', 'Sum and difference', '3.OA.D.8', '3',
    'Two numbers have a given sum and difference. Build comparison bars and find a number.',
    'Removing the difference segment leaves two equal parts of 40, so 20 and 30. Bars turn a puzzle into a method.',
    R => {
      const x = R.int(5, 40), D = R.int(2, 20), S = 2 * x + D, big = R.chance(), setup = barBoard([['Larger', [['Same'], ['Difference']]], ['Smaller', [['Smaller']]]]);
      return {
        prompt: `Two numbers add to ${S} and differ by ${D}. Set the Smaller bar, and the Larger bar as the same plus the difference. What is the ${big ? 'larger' : 'smaller'} number?`,
        setup, answer: { board: [{ t: 'segs', bar: 'Larger', values: [x, D], say: `The Larger bar is the same as Smaller, plus ${D}.` }, { t: 'segs', bar: 'Smaller', values: [x], say: `Set Smaller so both bars make ${S}.` }], box: { key: String(big ? x + D : x), label: `the ${big ? 'larger' : 'smaller'} number` } },
        hints: [`Set Difference to ${D}.`, `Take away the difference: ${S} - ${D} = ${S - D}, two equal parts.`, `${S - D} ÷ 2 = ${x}. The numbers are ${x} and ${x + D}.`],
        explain: `${x} + ${x + D} = ${S} and ${x + D} - ${x} = ${D}. Taking away the difference left two equal bars.`,
        solution: { board: solved(setup, { Larger: [x, D], Smaller: [x] }), box: String(big ? x + D : x) },
      };
    }),
  T('rate-bar', 'Rate bar', '6.RP.A.3b', '6',
    'A car travels at the same speed each hour. Build a bar with a part for each hour (and a half hour) and find the distance.',
    'Unit rate first: each hour segment is 60, so 3.5 hours is 210 miles. Half segments are allowed and should be labeled.',
    R => {
      const r = 10 * R.int(3, 7) + R.pick([0, 0, 5]), h = R.int(1, 3), what = R.pick(['A car', 'A bus', 'A train', 'A truck']);
      const setup = barBoard([['Miles', [...Array.from({ length: h }, (_, i) => [`Hour ${i + 1}`]), ['Half hour']]]]);
      return {
        prompt: `${what} travels ${r} miles in 1 hour. Set each part of the Miles bar for ${h}.5 hours at the same speed. How many miles in ${h}.5 hours?`,
        setup, answer: { board: [{ t: 'segs', bar: 'Miles', values: [...Array(h).fill(r), r / 2], say: `Each hour part is ${r}; the half hour part is half of that.` }], box: { key: String(r * h + r / 2), label: 'miles' } },
        hints: [`${typeIt} Each hour is ${r}.`, `A half hour is half of ${r}: ${r / 2}.`, `${h} × ${r} + ${r / 2} = ${r * h + r / 2}.`],
        explain: `${h}.5 × ${r} = ${r * h + r / 2} miles: ${h} hour parts of ${r} and a half part of ${r / 2}.`,
        solution: { board: solved(setup, { Miles: [...Array(h).fill(r), r / 2] }), box: String(r * h + r / 2) },
      };
    }),
  T('fraction-remainder', 'Fraction remainder', '5.NF.B.4', '5',
    'Part of a bar is used, given as a fraction. Set the used part and the part left, and find how much remains.',
    'One third is 12, used is 24, remains 12. Finding the unit fraction first is the reliable route.',
    R => {
      const n = R.int(3, 6), u = R.int(2, 12), W = n * u, a = R.int(1, n - 1), setup = barBoard([['Whole', [['Used'], ['Left']]]]);
      return {
        prompt: `A bar of ${W} has ${a}/${n} used. Set Used and Left on the bar. How much is left?`,
        setup, answer: { board: [{ t: 'segs', bar: 'Whole', values: [a * u, W - a * u], say: `Used is ${a}/${n} of ${W}; Left is the rest.` }], box: { key: String(W - a * u), label: 'left' } },
        hints: [`1/${n} of ${W} is ${W} ÷ ${n} = ${u}.`, `Used is ${a} × ${u} = ${a * u}.`, `${W} - ${a * u} = ${W - a * u} is left.`],
        explain: `1/${n} of ${W} is ${u}; ${a}/${n} is ${a * u}, so ${W - a * u} is left (${n - a}/${n} of the bar).`,
        solution: { board: solved(setup, { Whole: [a * u, W - a * u] }), box: String(W - a * u) },
      };
    }),
  T('three-part-whole', 'Three-part whole', '2.OA.A.1', '2',
    'A whole has three parts and two are known. Build a three-part bar and find the third part.',
    'Three parts must sum to the whole: riders are 7. Checking the sum closes the task.',
    R => {
      const [all, p1, p2, p3, big] = R.pick([['children in a class', 'Girls', 'Boys who walk', 'Boys who ride', 0], ['pets', 'Dogs', 'Cats', 'Fish', 1], ['books', 'Stories', 'Poems', 'Comics', 1], ['cars in a lot', 'Red', 'Blue', 'White', 1]]);
      const a = R.int(big ? 5 : 8, big ? 30 : 15), b = R.int(3, big ? 30 : 9), c = R.int(3, big ? 30 : 9), W = a + b + c, setup = barBoard([['Whole', [[p1], [p2], [p3]]]]);
      return {
        prompt: `There are ${W} ${all}: ${a} ${p1.toLowerCase()}, ${b} ${p2.toLowerCase()} and the rest ${p3.toLowerCase()}. Set all three parts of the bar. How many ${p3.toLowerCase()}?`,
        setup, answer: { board: [{ t: 'segs', bar: 'Whole', values: [a, b, c], say: `Set ${p1} to ${a}, ${p2} to ${b}, and ${p3} so all three make ${W}.` }], box: { key: String(c), label: p3.toLowerCase() } },
        hints: [`${typeIt} ${p1} is ${a}, ${p2} is ${b}.`, `${a} + ${b} = ${a + b}. The third part is the rest of ${W}.`, `${W} - ${a + b} = ${c}.`],
        explain: `${a} + ${b} + ${c} = ${W}, so there are ${c} ${p3.toLowerCase()}.`,
        solution: { board: solved(setup, { Whole: [a, b, c] }), box: String(c) },
      };
    }),
];
