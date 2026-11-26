// Money: the tool's 16 tasks as practice (docs/manip-practice-tasks.md). As in base-ten-blocks.js: each task keeps its
// title, code, grade and notes; make(R) gives one variation; conds are this tool's board checks, read from the board's
// coins and bills (a piece's value in cents is its kind's: manip-data.js MONEY). Checked on the whole board, or on a
// labeled work mat ("Way 1", "Toy 2": the pieces whose middle is on it). Money a student is only shown (savings so far)
// is locked. The fewest coins and bills are the biggest first; a student who has not met the half dollar (50¢) yet is
// right with the fewest without it too, except on the task about the half dollar itself.
import { boardWith, rowPlaces, objSizeOf, fmt, plural, countTo } from '../manip-task-kit.js';
import { allPieceDefs } from '../manip-data.js';
import { objRect, OBJ_HEAD, WORLD } from '../manip-board.js';

export const SLUG = 'money';
const DEFS = Object.fromEntries(allPieceDefs(SLUG).map(d => [d.kind, d]));
const CENTS = Object.fromEntries(allPieceDefs(SLUG).map(d => [d.kind, d.value]));
const ALL = ['b20', 'b10', 'b5', 'b1', 'half', 'quarter', 'dime', 'nickel', 'penny'];
const NO_HALF = ALL.filter(k => k !== 'half');
const NAME = { b20: '$20 bill', b10: '$10 bill', b5: '$5 bill', b1: '$1 bill', half: 'half dollar', quarter: 'quarter', dime: 'dime', nickel: 'nickel', penny: 'penny' };
const NAMES = { b20: '$20 bills', b10: '$10 bills', b5: '$5 bills', b1: '$1 bills', half: 'half dollars', quarter: 'quarters', dime: 'dimes', nickel: 'nickels', penny: 'pennies' };

// ---------------------------------------------------------------- money words and counting
/** $3.07, or 67¢ under a dollar when cents: true. */
export const money = (c, cents = false) => (cents && c < 100 ? `${c}¢` : `$${(c / 100).toFixed(2)}`);
/** The fewest coins and bills for c cents (biggest first), from these kinds. -> [kind] */
export function fewestOf(c, kinds = ALL) { const out = []; let r = c; for (const k of kinds) while (r >= CENTS[k]) { out.push(k); r -= CENTS[k]; } return out; }
const countsOf = list => list.reduce((o, k) => ({ ...o, [k]: (o[k] || 0) + 1 }), {});
/** "2 quarters, 1 dime and 3 pennies" */
function listText(list) {
  const has = countsOf(list), l = ALL.filter(k => has[k]).map(k => `${has[k]} ${has[k] === 1 ? NAME[k] : NAMES[k]}`);
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}` : l[0] || 'nothing';
}

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
let seq = 0;
/** A coin or bill at (x, y), as the page makes one (manip.js mkPiece). */
const piece = (kind, x, y, locked = false) => { const d = DEFS[kind]; return { id: `c${(++seq).toString(36)}`, kind, x: Math.round(x), y: Math.round(y), rot: 0, flipped: false, filled: true, locked, color: d.color, label: d.label, value: d.value, w: d.w, h: d.h }; };
/** Pieces in rows from (x0, y0), at most `wide` across, in the order given. */
function rows(list, x0, y0, wide, locked) {
  const out = []; let x = x0, y = y0, rowH = 0;
  for (const kind of list) {
    const d = DEFS[kind];
    if (x + d.w > x0 + wide && x > x0) { x = x0; y += rowH + 10; rowH = 0; }
    out.push(piece(kind, x, y, locked)); x += d.w + 10; rowH = Math.max(rowH, d.h);
  }
  return out;
}
const onMatAt = (o, list, locked) => rows(list, o.x + 16, o.y + OBJ_HEAD + 16, (num(o.st.w, 440)) - 32, locked);
/** A board: labeled mats in a row (mats: [{ label, has: [kinds], locked }]); loose: pieces on the board itself, in a row
 *  in the middle ({ has: [kinds], locked }). */
export function moneyBoard({ mats = [], loose = null } = {}) {
  const objs = mats.map((m, i) => ({ id: `m${i + 1}`, k: 'mat', s: 1, st: { label: m.label }, spec: m }));
  const places = objs.length ? rowPlaces(objs.map(o => objSizeOf(SLUG, o.k, o.st))) : [];
  const pieces = [];
  objs.forEach((o, i) => { o.x = places[i].x; o.y = places[i].y; if (o.spec.has) pieces.push(...onMatAt(o, o.spec.has, !!o.spec.locked)); delete o.spec; });
  if (loose) pieces.push(...rows(loose.has, Math.round(WORLD.w / 2 - 300), Math.round(WORLD.h / 2 - 60), 600, !!loose.locked));
  return boardWith(SLUG, objs, pieces);
}
/** The same board with the unlocked pieces replaced: on: { label: [kinds] } (on that mat), loose: [kinds] (a row in the
 *  middle, under anything already there). The solutions. */
function solved(setup, { on = {}, loose = null, keep = false } = {}) {
  const b = JSON.parse(JSON.stringify(setup));
  if (!keep) b.pieces = b.pieces.filter(p => p.locked);
  for (const [label, list] of Object.entries(on)) {
    const o = b.objects.find(x => x.k === 'mat' && x.st.label === label);
    b.pieces.push(...onMatAt(o, list, false));
  }
  if (loose) {
    const y = b.objects.length ? Math.max(...b.objects.map(o => { const r = objRect(SLUG, o); return r.y + r.h; })) + 40 : Math.round(WORLD.h / 2 - 60);
    b.pieces.push(...rows(loose, Math.round(WORLD.w / 2 - 300), y, 600, false));
  }
  return b;
}
/** A solution that keeps the setup's pieces it can and swaps the rest: has: { kind: count } wanted in the end. */
function traded(setup, has) {
  const b = JSON.parse(JSON.stringify(setup)), left = { ...has }, keep = [];
  for (const p of b.pieces) { if (p.locked) { keep.push(p); continue; } if (left[p.kind] > 0) { left[p.kind]--; keep.push(p); } }
  b.pieces = keep;
  const add = ALL.flatMap(k => Array(Math.max(0, left[k] || 0)).fill(k));
  const y = Math.max(...b.pieces.map(p => p.y + p.h), WORLD.h / 2) + 30;
  b.pieces.push(...rows(add, Math.round(WORLD.w / 2 - 300), y, 600, false));
  return b;
}

// ---------------------------------------------------------------- the checks
const piecesOf = b => ((b && Array.isArray(b.pieces)) ? b.pieces : []).filter(p => p && typeof p === 'object' && DEFS[p.kind] && !p.locked)
  .map(p => ({ kind: p.kind, x: num(p.x), y: num(p.y), w: num(p.w, DEFS[p.kind].w), h: num(p.h, DEFS[p.kind].h) }));
const matOf = (b, label) => ((b && Array.isArray(b.objects)) ? b.objects : []).find(o => o && o.k === 'mat' && o.st && o.st.label === label) || null;
/** The unlocked pieces a check is about: on the mat with its label, or all of them. */
function scope(b, label) {
  const ps = piecesOf(b); if (!label) return ps;
  const o = matOf(b, label); if (!o) return [];
  const r = objRect(SLUG, { ...o, st: o.st || {} });
  return ps.filter(p => { const cx = p.x + p.w / 2, cy = p.y + p.h / 2; return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h; });
}
const cents = ps => ps.reduce((s, p) => s + CENTS[p.kind], 0);
/** Reading order: rows top to bottom (middles within 24 px are one row), each left to right. */
function reading(ps) {
  const by = [...ps].sort((p, q) => (p.y + p.h / 2) - (q.y + q.h / 2)), out = [];
  let row = [], top = null;
  for (const p of by) { const cy = p.y + p.h / 2; if (top !== null && cy - top > 24) { out.push(...row.sort((a, b) => a.x - b.x)); row = []; top = null; } if (top === null) top = cy; row.push(p); }
  return [...out, ...row.sort((a, b) => a.x - b.x)];
}
export const conds = {
  /** The money (on the mat label, or all) is n cents. */
  total: (c, b) => cents(scope(b, c.label)) === c.n,
  /** The fewest coins and bills for what is there. either: the fewest without the half dollar counts too (when none
   *  is used). */
  fewest: (c, b) => { const ps = scope(b, c.label), t = cents(ps); return ps.length > 0 && (ps.length === fewestOf(t).length || (c.either && !ps.some(p => p.kind === 'half') && ps.length === fewestOf(t, NO_HALF).length)); },
  /** More coins and bills on this mat than on the mat `than`. */
  more: (c, b) => scope(b, c.label).length > scope(b, c.than).length,
  /** Exactly these many of each kind (has), and none of any other. */
  counts: (c, b) => { const ps = scope(b, c.label); return ALL.every(k => ps.filter(p => p.kind === k).length === (c.has[k] || 0)); },
  /** Only these kinds. */
  only: (c, b) => { const ps = scope(b, c.label); return ps.length > 0 && ps.every(p => c.kinds.includes(p.kind)); },
  /** These kinds in reading order (left to right, row by row). */
  order: (c, b) => reading(scope(b, c.label)).map(p => p.kind).join(',') === c.kinds.join(','),
};

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
/** Counting up from a price to what was paid: "$1.35 to $1.40, then to $2.00, then to $5.00". */
function countUp(p, pay) {
  const steps = []; let at = p;
  const to = x => { if (x > at && x <= pay) { steps.push(money(x)); at = x; } };
  to(Math.ceil(at / 5) * 5); to(Math.ceil(at / 25) * 25); to(Math.ceil(at / 100) * 100); to(Math.ceil(at / 500) * 500); to(pay);
  return `Count up from ${money(p)}: ${steps.join(', ')}.`;
}
/** A price in quarters of a dollar from lo to hi cents. */
const priceQ = (R, lo, hi) => 25 * R.int(Math.ceil(lo / 25), Math.floor(hi / 25));
export const TASKS = [
  T('make-67-cents', 'Make an amount of cents', '2.MD.C.8', '2',
    'Make an amount two ways: Way 1 with the fewest coins, Way 2 with more coins. How many coins does Way 1 use?',
    'Fewest coins means biggest coins first. Children who start with pennies need the exchange idea: ten pennies become a dime.',
    R => {
      const A = R.int(30, 99), w1 = fewestOf(A, NO_HALF), first = w1[0], swap = { quarter: ['dime', 'dime', 'nickel'], dime: ['nickel', 'nickel'], nickel: Array(5).fill('penny') }[first];
      const w2 = [...swap, ...w1.slice(1)], setup = moneyBoard({ mats: [{ label: 'Way 1' }, { label: 'Way 2' }] }), k1 = fewestOf(A).length;
      return {
        prompt: `Make ${A}¢ two ways. Way 1: use the fewest coins you can. Way 2: use more coins. How many coins does Way 1 use?`,
        setup, answer: { board: [
          { t: 'total', label: 'Way 1', n: A, say: `Way 1 should make ${A}¢.` },
          { t: 'fewest', label: 'Way 1', either: true, say: 'Way 1: start with the biggest coins you can.' },
          { t: 'total', label: 'Way 2', n: A, say: `Way 2 should make ${A}¢ too.` },
          { t: 'more', label: 'Way 2', than: 'Way 1', say: 'Way 2 needs more coins than Way 1.' }],
        box: { key: String(w1.length), keys: [String(w1.length), String(k1)], label: 'coins in Way 1' } },
        hints: [`Way 1: take the biggest coin that fits in ${A}¢, then the next, and so on.`, `Way 1 is ${listText(w1)}. For Way 2, trade one coin for smaller ones.`, `Way 1 uses ${w1.length} coins.`],
        explain: `${listText(w1)} make ${A}¢ with ${w1.length} coins. Biggest coins first gives the fewest; any trade for smaller coins makes more.`,
        solution: { board: solved(setup, { on: { 'Way 1': w1, 'Way 2': w2 } }), box: String(w1.length) },
      };
    }),
  T('exact-change', 'Exact change', '2.MD.C.8', '2',
    'Something costs less than $5. You pay with a $5 bill. Show the change with coins and bills, counting up from the price.',
    'Counting up from the price to $5 is the shopkeeper\'s method and far more reliable than column subtraction for money.',
    R => {
      const P = 5 * R.int(21, 99), C = 500 - P, setup = moneyBoard({});
      return {
        prompt: `A toy costs ${money(P)}. You pay with a $5 bill. Show the change with coins and bills. How much change do you get?`,
        setup, answer: { board: [{ t: 'total', n: C, say: `The coins and bills should be the change from $5.00.` }], box: { key: money(C), label: 'change' } },
        hints: [countUp(P, 500), `Each step you add is part of the change.`, `$5.00 - ${money(P)} = ${money(C)}.`],
        explain: `${money(P)} + ${money(C)} = $5.00, so the change is ${money(C)}.`,
        solution: { board: solved(setup, { loose: fewestOf(C, NO_HALF) }), box: money(C) },
      };
    }),
  T('coin-exchange', 'Coin exchange', '2.NBT.A.1', '2',
    'Trade ten pennies for a dime, or ten dimes for a $1 bill. How much money is it?',
    'Money exchange is base ten in disguise: 10 dimes = 1 dollar mirrors 10 rods = 1 flat. Name the parallel explicitly.',
    R => {
      const kind = R.pick(['penny', 'dime']), up = kind === 'penny' ? 'dime' : 'b1', n = R.int(10, 19), c = n * CENTS[kind];
      const setup = moneyBoard({ loose: { has: Array(n).fill(kind) } }), want = { [up]: 1, ...(n > 10 ? { [kind]: n - 10 } : {}) };
      return {
        prompt: `There are ${n} ${NAMES[kind]}. Trade ten of them for one ${NAME[up]}: hold a ${NAME[kind]} and pick Delete ten times, then add the ${NAME[up]}. How much money is it?`,
        setup, answer: { board: [{ t: 'counts', has: want, say: `Take away ten ${NAMES[kind]} and add one ${NAME[up]}.` }], box: { key: money(c), label: 'how much money' } },
        hints: [`Ten ${NAMES[kind]} are worth ${money(10 * CENTS[kind])}, the same as one ${NAME[up]}.`, `After the trade: 1 ${NAME[up]} and ${n - 10} ${n - 10 === 1 ? NAME[kind] : NAMES[kind]}.`, `That is ${money(c)}.`],
        explain: `${n} ${NAMES[kind]} = ${money(c)} = 1 ${NAME[up]} and ${n - 10} ${n - 10 === 1 ? NAME[kind] : NAMES[kind]}. Ten of one make one of the next, like ten ones make a ten.`,
        solution: { board: traded(setup, want), box: money(c) },
      };
    }),
  T('budget-build', 'Budget build', '4.MD.A.2', '4',
    'You have a budget and buy three things. Show the money left over with bills and coins.',
    'Total is $18.50, leaving $1.50. Insist the leftover is shown in coins, which forces decimal addition to be exact.',
    R => {
      const B = R.pick([10, 20]); let ps;
      do { ps = [0, 1, 2].map(() => (B === 20 ? priceQ(R, 300, 700) : priceQ(R, 125, 350))); } while (ps[0] + ps[1] + ps[2] > B * 100 - 25 || new Set(ps).size < 3);
      const left = B * 100 - ps[0] - ps[1] - ps[2], setup = moneyBoard({});
      return {
        prompt: `You have $${B}. You buy things that cost ${money(ps[0])}, ${money(ps[1])} and ${money(ps[2])}. Show the money left over with bills and coins. How much is left?`,
        setup, answer: { board: [{ t: 'total', n: left, say: 'The coins and bills should be the money left over.' }], box: { key: money(left), label: 'left over' } },
        hints: [`Add the three prices first: ${money(ps[0])} + ${money(ps[1])} + ${money(ps[2])}.`, `They cost ${money(B * 100 - left)} in all. Count up from there to $${B}.00.`, `$${B}.00 - ${money(B * 100 - left)} = ${money(left)}.`],
        explain: `${money(ps[0])} + ${money(ps[1])} + ${money(ps[2])} = ${money(B * 100 - left)}, and $${B}.00 - ${money(B * 100 - left)} = ${money(left)} left over.`,
        solution: { board: solved(setup, { loose: fewestOf(left, NO_HALF) }), box: money(left) },
      };
    }),
  T('make-a-dollar', 'Make a dollar', '2.MD.C.8', '2',
    'Make an amount using only one kind of coin. How many coins does it take?',
    '10 dimes, 20 nickels. The mix invites quarters. Counting each set to 100 cents is the check.',
    R => {
      const kind = R.pick(['dime', 'nickel', 'quarter']), v = CENTS[kind];
      const A = kind === 'dime' ? 10 * R.int(2, 20) : kind === 'nickel' ? 5 * R.int(4, 20) : 25 * R.int(2, 12), n = A / v, setup = moneyBoard({});
      return {
        prompt: `Make ${money(A, true)} using only ${NAMES[kind]}. How many ${NAMES[kind]} do you need?`,
        setup, answer: { board: [{ t: 'counts', has: { [kind]: n }, say: `Use only ${NAMES[kind]}, and make ${money(A, true)}.` }], box: { key: String(n), label: NAMES[kind] } },
        hints: [`A ${NAME[kind]} is ${v}¢. Count by ${v}s.`, `Count: ${countTo(n, v, 'until you reach')}.`, `${n} ${NAMES[kind]} make ${money(A, true)}: ${n} × ${v} = ${A}.`],
        explain: `${n} ${NAMES[kind]} × ${v}¢ = ${A}¢${A >= 100 ? ` = ${money(A)}` : ''}.`,
        solution: { board: solved(setup, { loose: Array(n).fill(kind) }), box: String(n) },
      };
    }),
  T('change-from-10', 'Change from 10', '4.MD.A.2', '4',
    'Something costs less than $10. Pay with $10 and show the change by counting up.',
    'Counting up: 60 cents to 7 dollars, then 3 dollars to 10, change 3.60. The count-up method avoids borrowing errors.',
    R => {
      let P; do { P = R.int(101, 999); } while (P % 100 === 0);
      const C = 1000 - P, setup = moneyBoard({});
      return {
        prompt: `Something costs ${money(P)}. You pay with $10. Show the change with bills and coins by counting up. How much change do you get?`,
        setup, answer: { board: [{ t: 'total', n: C, say: 'The coins and bills should be the change from $10.00.' }], box: { key: money(C), label: 'change' } },
        hints: [`First count up the cents to the next dollar: ${money(P)} to ${money(Math.ceil(P / 100) * 100)} is ${100 - (P % 100)}¢.`, `Then count up the dollars from ${money(Math.ceil(P / 100) * 100)} to $10.00.`, `${100 - (P % 100)}¢ and $${10 - Math.ceil(P / 100)} make ${money(C)}.`],
        explain: `${money(P)} + ${money(C)} = $10.00. Counting up to the next dollar and then to $10 avoids borrowing.`,
        solution: { board: solved(setup, { loose: fewestOf(C, NO_HALF) }), box: money(C) },
      };
    }),
  T('coin-values-sort', 'Coin values sort', '2.MD.C.8', '2',
    'Put out one of each of some coins in a row, ordered by value. How much are they worth together?',
    'A dime is smaller in size but worth more than a nickel: value is not size. That misconception needs naming.',
    R => {
      const kinds = R.shuffle(['penny', 'nickel', 'dime', 'quarter', 'half', 'b1']).slice(0, R.int(3, 4)), up = R.chance(0.5);
      const sorted = [...kinds].sort((a, b) => (up ? CENTS[a] - CENTS[b] : CENTS[b] - CENTS[a])), c = kinds.reduce((s, k) => s + CENTS[k], 0), setup = moneyBoard({});
      const names = kinds.map(k => `a ${NAME[k]}`);
      return {
        prompt: `Put out ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} in a row from ${up ? 'the least to the greatest' : 'the greatest to the least'} value, left to right. How much are they worth together?`,
        setup, answer: { board: [
          { t: 'counts', has: countsOf(kinds), say: `Put out one of each: ${kinds.map(k => NAME[k]).join(', ')}.` },
          { t: 'order', kinds: sorted, say: `Line them up from ${up ? 'the least to the greatest' : 'the greatest to the least'} value, left to right.` }],
        box: { key: money(c), label: 'worth together' } },
        hints: [`Their values: ${kinds.map(k => `${NAME[k]} ${money(CENTS[k], true)}`).join(', ')}.`, 'Size does not tell the value: a dime is small but worth more than a nickel.', `In order: ${sorted.map(k => NAME[k]).join(', ')}. Together ${money(c)}.`],
        explain: `${sorted.map(k => money(CENTS[k], true)).join(up ? ' < ' : ' > ')}. Together they are worth ${money(c)}.`,
        solution: { board: solved(setup, { loose: sorted }), box: money(c) },
      };
    }),
  T('two-ways-to-pay', 'Two ways to pay', '2.MD.C.8', '2',
    'Pay an amount two ways: with only dimes and pennies, and with the fewest coins. Which way would a shopkeeper prefer?',
    'Fewer coins is usually preferred. Children should justify with coin counts, not just preference.',
    R => {
      const A = R.int(50, 99), f = R.int(0, 1), labels = ['Way 1', 'Way 2'], dp = [...Array(Math.floor(A / 10)).fill('dime'), ...Array(A % 10).fill('penny')], few = fewestOf(A, NO_HALF);
      const setup = moneyBoard({ mats: [{ label: 'Way 1' }, { label: 'Way 2' }] }), F = labels[f], D = labels[1 - f];
      return {
        prompt: `Pay ${A}¢ two ways. On ${D}, use only dimes and pennies. On ${F}, use the fewest coins you can. Which way would a shopkeeper like better?`,
        setup, answer: { board: [
          { t: 'total', label: D, n: A, say: `${D} should make ${A}¢.` }, { t: 'only', label: D, kinds: ['dime', 'penny'], say: `${D}: only dimes and pennies.` },
          { t: 'total', label: F, n: A, say: `${F} should make ${A}¢.` }, { t: 'fewest', label: F, either: true, say: `${F}: start with the biggest coins you can.` }],
        choice: { options: labels, correct: f, say: 'Count the coins on each mat. Which is quicker to count and carry?' } },
        hints: [`${D}: ${plural(Math.floor(A / 10), 'dime')} and ${plural(A % 10, 'penny', 'pennies')}.`, `${F}: ${listText(few)}.`, `${F} uses ${few.length} coins and ${D} uses ${dp.length}: a shopkeeper likes fewer coins.`],
        explain: `Both make ${A}¢, but ${F} uses ${few.length} coins and ${D} uses ${dp.length}. Fewer coins are quicker to count, so ${F} is better.`,
        solution: { board: solved(setup, { on: { [D]: dp, [F]: few } }), choice: f },
      };
    }),
  T('bill-exchange', 'Bill exchange', '2.NBT.A.1', '2',
    'Trade ten $1 bills for a $10 bill. What pattern rules the trade, and how much money is it?',
    'Ten of one bill makes the next, mirroring place value exactly. Naming the parallel is the learning goal.',
    R => {
      const ones = R.int(10, 19), tens = R.int(0, 4), c = 100 * ones + 1000 * tens;
      const setup = moneyBoard({ loose: { has: [...Array(tens).fill('b10'), ...Array(ones).fill('b1')] } }), want = { b10: tens + 1, ...(ones > 10 ? { b1: ones - 10 } : {}) };
      return {
        prompt: `There ${tens === 1 ? 'is 1 $10 bill' : `are ${tens} $10 bills`} and ${ones} $1 bills. Trade ten $1 bills for one $10 bill: hold a $1 bill and pick Delete ten times, then add a $10 bill. How much money is it?`,
        setup, answer: { board: [{ t: 'counts', has: want, say: 'Take away ten $1 bills and add one $10 bill.' }], box: { key: money(c), label: 'how much money' } },
        hints: ['Ten $1 bills are $10, the same as one $10 bill.', `After the trade: ${plural(tens + 1, '$10 bill')} and ${plural(ones - 10, '$1 bill')}.`, `${plural(tens + 1, 'ten')} and ${plural(ones - 10, 'one')}: $${fmt(c / 100)}.`],
        explain: `$${fmt(c / 100)} is ${plural(tens + 1, 'ten')} and ${plural(ones - 10, 'one')}. Ten of one bill make one of the next, just like place value.`,
        solution: { board: traded(setup, want), box: money(c) },
      };
    }),
  T('budget-left-over', 'Budget left over', '4.MD.A.2', '4',
    'You have some money and three things to buy. Build the total cost, then say if you can buy all three.',
    'Total 13.50, so yes with 1.50 left. Showing leftover in coins forces exact decimal addition.',
    R => {
      const B = R.pick([10, 15, 20]), want = R.chance(0.5); let ps, s;
      do { ps = [0, 1, 2].map(() => priceQ(R, 150, B * 40)); s = ps[0] + ps[1] + ps[2]; } while ((s <= B * 100) !== want || new Set(ps).size < 3 || Math.abs(s - B * 100) > 600);
      const setup = moneyBoard({}), options = ['Yes, I can buy all three', 'No, I need more money'];
      return {
        prompt: `You have $${B}. Things cost ${money(ps[0])}, ${money(ps[1])} and ${money(ps[2])}. Build the total cost with bills and coins. What is the total, and can you buy all three?`,
        setup, answer: { board: [{ t: 'total', n: s, say: 'Build the total cost of the three things.' }], box: { key: money(s), label: 'total cost' }, choice: { options, correct: want ? 0 : 1, say: `Compare the total with $${B}.00.` } },
        hints: [`Add the dollars first, then the cents: ${money(ps[0])} + ${money(ps[1])} + ${money(ps[2])}.`, `The total is ${money(s)}. Is that more than $${B}.00?`, want ? `${money(s)} is not more than $${B}.00: yes, with ${money(B * 100 - s)} left.` : `${money(s)} is more than $${B}.00: you need ${money(s - B * 100)} more.`],
        explain: want ? `The total is ${money(s)}, so $${B} is enough, with ${money(B * 100 - s)} left over.` : `The total is ${money(s)}, which is ${money(s - B * 100)} more than $${B}.`,
        solution: { board: solved(setup, { loose: fewestOf(s, NO_HALF) }), box: money(s), choice: want ? 0 : 1 },
      };
    }),
  T('half-dollar-talk', 'Half dollar talk', '2.MD.C.8', '2',
    'Make an amount of at least 50¢ with the fewest coins, using the one coin worth 50¢. How many coins, and what is that coin called?',
    'The half dollar is one coin for 50 cents. Comparing ways shows coin choice is about efficiency.',
    R => {
      const A = R.int(50, 99), few = fewestOf(A), order = R.shuffle([0, 1, 2]), names = ['Half dollar', 'Quarter', 'Dime'], options = order.map(i => names[i]), setup = moneyBoard({});
      return {
        prompt: `Make ${A}¢ with the fewest coins. Use the coin that is worth 50¢ all by itself. How many coins did you use? What is the 50¢ coin called?`,
        setup, answer: { board: [{ t: 'total', n: A, say: `The coins should make ${A}¢.` }, { t: 'fewest', say: 'Start with the 50¢ coin, then the biggest coins that fit.' }],
          box: { key: String(few.length), label: 'coins' }, choice: { options, correct: order.indexOf(0), say: 'Two quarters make 50¢. Which one coin does too?' } },
        hints: ['The 50¢ coin is the biggest coin in the palette.', `${A}¢ is 50¢ and ${A - 50}¢ more: ${listText(few)}.`, `That is ${few.length} coin${few.length === 1 ? '' : 's'}. The 50¢ coin is the half dollar.`],
        explain: `A half dollar is worth 50¢, as much as two quarters, so it saves a coin: ${A}¢ is ${listText(few)}.`,
        solution: { board: solved(setup, { loose: few }), box: String(few.length), choice: order.indexOf(0) },
      };
    }),
  T('price-compare', 'Price compare', '4.NBT.A.2', '4',
    'Two prices sit on each side of a whole dollar. Build both, say which costs more and by how much.',
    '8.05 is more by 6 cents. The 99 cents traps children into thinking the first is more because 99 beats 5.',
    R => {
      const D = R.int(2, 9), lo = 100 * D - R.int(1, 15), hi = 100 * D + R.int(1, 15), flip = R.chance(0.5), p1 = flip ? hi : lo, p2 = flip ? lo : hi;
      const setup = moneyBoard({ mats: [{ label: 'Toy 1' }, { label: 'Toy 2' }] }), options = ['Toy 1', 'Toy 2'], correct = p1 > p2 ? 0 : 1;
      return {
        prompt: `Toy 1 costs ${money(p1)} and Toy 2 costs ${money(p2)}. Build each price on its mat. Which costs more, and by how much?`,
        setup, answer: { board: [{ t: 'total', label: 'Toy 1', n: p1, say: `Build ${money(p1)} on Toy 1.` }, { t: 'total', label: 'Toy 2', n: p2, say: `Build ${money(p2)} on Toy 2.` }],
          box: { key: money(hi - lo), label: 'how much more' }, choice: { options, correct, say: 'Compare the dollars first, then the cents.' } },
        hints: ['Compare the dollars before the cents.', `${money(hi)} has ${D} dollars; ${money(lo)} has only ${D - 1}.`, `${money(hi)} - ${money(lo)} = ${money(hi - lo)}.`],
        explain: `${money(hi)} costs more: it has more dollars, even though ${money(lo)} has more cents. The difference is ${money(hi - lo)}.`,
        solution: { board: solved(setup, { on: { 'Toy 1': fewestOf(p1, NO_HALF), 'Toy 2': fewestOf(p2, NO_HALF) } }), box: money(hi - lo), choice: correct },
      };
    }),
  T('saving-goal', 'Saving goal', '4.MD.A.2', '4',
    'You are saving for something. The money saved so far is on the board. Show how much more you need, in bills and coins.',
    '7 dollars 50 more. Counting up from what you have to the goal is the natural method here.',
    R => {
      const G = R.int(10, 30), need = 25 * R.int(3, 39), H = 100 * G - need;
      const setup = moneyBoard({ mats: [{ label: 'Saved', has: fewestOf(H, NO_HALF), locked: true }] });
      return {
        prompt: `You need $${G}.00. You have saved ${money(H)}: it is on the Saved mat. Put out the money you still need with bills and coins. How much more must you save?`,
        setup, answer: { board: [{ t: 'total', n: need, say: 'Put out only the money you still need.' }], box: { key: money(need), label: 'how much more' } },
        hints: [countUp(H, 100 * G), 'Each step you count up is money you still need.', `$${G}.00 - ${money(H)} = ${money(need)}.`],
        explain: `${money(H)} + ${money(need)} = $${G}.00, so you need ${money(need)} more.`,
        solution: { board: solved(setup, { loose: fewestOf(need, NO_HALF) }), box: money(need) },
      };
    }),
  T('quarter-collection', 'Quarter collection', '2.MD.C.8', '2',
    'Add quarters one at a time until you pass an amount. How many quarters, and what total do you land on?',
    '8 quarters make exactly 2 dollars, so passing it needs 9 quarters, 2.25. The exact landing is a nice surprise to discuss.',
    R => {
      let T0; do { T0 = 5 * R.int(21, 99); } while (T0 % 25 === 0);
      const n = Math.floor(T0 / 25) + 1, setup = moneyBoard({});
      return {
        prompt: `Add quarters one at a time until you have more than ${money(T0)}. Stop as soon as you pass it. How much money do you land on?`,
        setup, answer: { board: [{ t: 'counts', has: { quarter: n }, say: `Use only quarters, and stop just after ${money(T0)}.` }], box: { key: money(25 * n), label: 'you land on' } },
        hints: ['Count by quarters: $0.25, $0.50, $0.75, $1.00, ...', `Four quarters make a dollar. ${n - 1} quarters are ${money(25 * (n - 1))}, not more than ${money(T0)} yet.`, `${n} quarters are ${money(25 * n)}.`],
        explain: `${n - 1} quarters make ${money(25 * (n - 1))}, so the ${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} quarter passes ${money(T0)} and lands on ${money(25 * n)}.`,
        solution: { board: solved(setup, { loose: Array(n).fill('quarter') }), box: money(25 * n) },
      };
    }),
  T('decimal-money-write', 'Decimal money write', '4.MD.A.2', '4',
    'Build an amount of dollars and cents, then write it with a decimal point.',
    'Seven cents is seven hundredths, needing the zero placeholder. Money is the friendliest decimal context for this idea.',
    R => {
      const d = R.int(1, 9), c = R.chance(0.7) ? R.int(1, 9) : R.int(10, 99), t = 100 * d + c, setup = moneyBoard({});
      return {
        prompt: `Build ${d} dollar${d === 1 ? '' : 's'} and ${c} cent${c === 1 ? '' : 's'} with bills and coins. Then write it as a money amount with a decimal point.`,
        setup, answer: { board: [{ t: 'total', n: t, say: `Build ${plural(d, 'dollar')} and ${plural(c, 'cent')}.` }], box: { key: money(t), label: 'the amount' } },
        hints: [`The dollars go before the point: ${d}.`, `Cents are hundredths: they take two places after the point.${c < 10 ? ` ${plural(c, 'cent')} is 0${c}.` : ''}`, `${plural(d, 'dollar')} and ${plural(c, 'cent')} is ${money(t)}.`],
        explain: `${money(t)}: ${plural(d, 'dollar')}, then ${plural(c, 'cent')} in the two places after the point.${c < 10 ? ` Without the 0 it would read $${d}.${c}0, which is ${c * 10} cents.` : ''}`,
        solution: { board: solved(setup, { loose: fewestOf(t, NO_HALF) }), box: money(t) },
      };
    }),
  T('make-change-challenge', 'Make change challenge', '4.MD.A.2', '4',
    'Something is paid for with a bill. Make the change with the fewest coins and bills possible. How many pieces?',
    'Change 2.65: two dollars, two quarters, one dime, one nickel. Fewest-coins is an optimization children enjoy.',
    R => {
      const pay = R.pick([5, 10]); let P; do { P = R.int(101, pay * 100 - 1); } while (P % 100 === 0);
      const C = pay * 100 - P, few = fewestOf(C, NO_HALF), setup = moneyBoard({});
      return {
        prompt: `It costs ${money(P)}. You pay with a $${pay} bill. Make the change with the fewest coins and bills you can. How many coins and bills is that?`,
        setup, answer: { board: [{ t: 'total', n: C, say: `The coins and bills should be the change from $${pay}.00.` }, { t: 'fewest', either: true, say: 'Use the biggest bills and coins that fit first.' }],
          box: { key: String(few.length), keys: [String(few.length), String(fewestOf(C).length)], label: 'coins and bills' } },
        hints: [`The change is $${pay}.00 - ${money(P)} = ${money(C)}.`, 'Take the biggest bill or coin that fits, then the next biggest, and so on.', `${listText(few)}: ${plural(few.length, 'piece')}.`],
        explain: `${money(C)} is ${listText(few)}: ${plural(few.length, 'piece')}. The biggest pieces first always gives the fewest.`,
        solution: { board: solved(setup, { loose: few }), box: String(few.length) },
      };
    }),
];
