// Two-Color Counters: the tool's 17 tasks as practice (docs/manip-practice-tasks.md). As in rekenreks.js: each task
// keeps its title, code, grade and notes; make(R) gives one variation; conds are this tool's board checks, read from
// the board's counters (yellow pos +1, red neg -1, blue, green), a ten-frame's cells and a part-part-whole mat's three
// parts. Every variation hides the board's totals (the tool's "Value 3 · Zero pairs 2" would give answers away).
import { boardWith, rowPlaces, objSizeOf, plural, times } from '../manip-task-kit.js';
import { allPieceDefs } from '../manip-data.js';
import { slotsOf, OBJ_HEAD } from '../manip-board.js';
import { piecesOf, inside } from './piece-grid.js';

export const SLUG = 'two-color-counters';
const DEFS = Object.fromEntries(allPieceDefs(SLUG).map(d => [d.kind, d]));
const COLOR = { pos: 'yellow', neg: 'red', blue: 'blue', green: 'green' };
const NOUNS = ['apples', 'buttons', 'beads', 'stars', 'shells', 'marbles', 'leaves', 'balloons'];

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
let seq = 0;
/** A counter of a kind at (x, y), as the page makes one (manip.js mkPiece). */
const counter = (kind, x, y, locked = false) => { const d = DEFS[kind]; return { id: `c${(++seq).toString(36)}`, kind, x: Math.round(x), y: Math.round(y), rot: 0, flipped: false, filled: true, locked, color: d.color, label: d.label, value: d.value, w: d.w, h: d.h }; };
/** Counters for `list` ([kind, kind...]) in rows from (x, y), `per` to a row, 54 px apart. */
const rowsAt = (list, x0, y0, per, locked) => list.map((k, i) => counter(k, x0 + (i % per) * 54, y0 + Math.floor(i / per) * 54, locked));
const many = has => Object.entries(has).flatMap(([k, n]) => Array(n).fill(k));
/**
 * A board: objects in one row, centered ({ k: 'ten-frame' | 'ppw' | 'mat', s, label, st }); pieces: built by each
 * object's `fill(o)` (its counters), plus `loose` counters scattered under the objects.
 */
export function countersBoard(objs = [{ k: 'mat' }], { loose = null } = {}) {
  const os = objs.map((o, i) => ({ id: `o${i + 1}`, k: o.k, s: o.s || 1, locked: true, st: { ...(o.k === 'ten-frame' ? { n: 10 } : {}), ...(o.label ? { label: o.label } : {}), ...(o.st || {}) }, fill: o.fill }));
  const places = !os.length ? [] : rowPlaces(os.map(o => { const z = objSizeOf(SLUG, o.k, o.st); return { w: z.w * o.s, h: z.h * o.s }; }));
  const pieces = [];
  os.forEach((o, i) => { o.x = places[i].x; o.y = places[i].y; if (o.fill) pieces.push(...o.fill(o)); delete o.fill; });
  if (loose) pieces.push(...scatter(loose.list, loose.R, loose.locked, places.length ? Math.max(...os.map(o => o.y + objSizeOf(SLUG, o.k, o.st).h * o.s)) + 40 : 1000));
  return boardWith(SLUG, os, pieces);
}
/** Counters scattered (a mixed pile): a shuffled grid with a little wobble, from y0, about 700 wide. */
function scatter(list, R, locked, y0) {
  const per = 10, cells = R.shuffle(Array.from({ length: Math.max(list.length, per * Math.ceil(list.length / per) + per) }, (_, i) => i));
  return list.map((k, i) => { const c = cells[i]; return counter(k, 1650 + (c % per) * 70 + R.int(-8, 8), y0 + Math.floor(c / per) * 70 + R.int(-8, 8), locked); });
}
/** A part-part-whole mat's three parts as rectangles (manip.css .mp-ppw: the whole on top, two parts under it). */
export function ppwParts(o) {
  const s = num(o.s, 1), X = num(o.x), Y = num(o.y) + OBJ_HEAD * s, w = 440 * s, h = 320 * s, pad = 10 * s, gap = 10 * s, rh = (h - 2 * pad - gap) / 2, cw = (w - 2 * pad - gap) / 2;
  return { whole: { x: X + pad, y: Y + pad, w: w - 2 * pad, h: rh }, a: { x: X + pad, y: Y + pad + rh + gap, w: cw, h: rh }, b: { x: X + pad + cw + gap, y: Y + pad + rh + gap, w: cw, h: rh } };
}
/** Counters filling a part of a ppw (rows from its top left). */
const inPart = (o, part, list, locked) => { const r = ppwParts(o)[part], per = Math.max(1, Math.floor((r.w - 8) / 54)); return rowsAt(list, r.x + 6, r.y + 6, per, locked); };
/** Counters in a ten-frame's first cells. */
const inFrame = (o, list, locked = false) => slotsOf(SLUG, o).slice(0, list.length).map((sl, i) => counter(list[i], sl.x + (sl.w - 48) / 2, sl.y + (sl.h - 48) / 2, locked));

// ---------------------------------------------------------------- the checks
const objsOf = b => ((b && Array.isArray(b.objects)) ? b.objects : []).filter(o => o && typeof o === 'object');
const objOf = (b, k, label) => objsOf(b).filter(o => o.k === k).find(o => !label || (o.st && o.st.label) === label) || null;
const tally = ps => { const t = { pos: 0, neg: 0, blue: 0, green: 0 }; for (const p of ps) if (p.kind in t) t[p.kind]++; return t; };
const same = (t, has) => Object.keys(t).every(k => t[k] === (has[k] || 0));
export const conds = {
  /** Exactly these counters on the board (every kind not named: 0). */
  counts: (c, b) => same(tally(piecesOf(b, null, 48)), c.has),
  /** Yellow minus red is n. */
  value: (c, b) => { const t = tally(piecesOf(b, null, 48)); return t.pos - t.neg === c.n; },
  /** No zero pairs left: not both yellow and red. */
  noPairs: (c, b) => { const t = tally(piecesOf(b, null, 48)); return t.pos === 0 || t.neg === 0; },
  /** The ten-frame's cells hold these counters (order: in the first cells, the top row first, no gaps). */
  frame: (c, b) => {
    const o = objOf(b, 'ten-frame', c.label); if (!o) return false;
    const cells = slotsOf(SLUG, { ...o, k: 'ten-frame' }), ps = piecesOf(b, null, 48);
    const seat = cells.map(sl => ps.filter(p => inside(p, sl)));
    if (seat.some(l => l.length > 1)) return false;
    const on = seat.flat(), want = Object.values(c.has).reduce((s, n) => s + n, 0);
    if (!same(tally(on), c.has)) return false;
    return !c.order || seat.every((l, i) => (i < want ? l.length === 1 : l.length === 0));
  },
  /** A part-part-whole mat: one part holds `a`, the other `b` (either way round), the whole `whole` (when named). */
  ppw: (c, b) => {
    const o = objOf(b, 'ppw', c.label); if (!o) return false;
    const r = ppwParts(o), ps = piecesOf(b, null, 48), of = k => tally(ps.filter(p => inside(p, r[k])));
    const A = of('a'), B = of('b');
    if (c.whole && !same(of('whole'), c.whole)) return false;
    return (same(A, c.a) && same(B, c.b)) || (same(A, c.b) && same(B, c.a));
  },
};

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
const sign = n => (n < 0 ? `−${-n}` : String(n));
/** An integer answer box: "-3" (or "−3"); a positive one also as "+3". */
const intBox = (n, label) => ({ key: String(n), ...(n > 0 ? { keys: [String(n), `+${n}`] } : {}), label });
const has = (pos, neg) => ({ pos, neg });
/** "3 yellow and 4 red counters"; with a single one, "3 yellow counters and 1 red counter". */
const yr = (y, r) => (y === 1 || r === 1 ? `${plural(y, 'yellow counter')} and ${plural(r, 'red counter')}` : `${y} yellow and ${r} red counters`);
/** "1 apple" / "3 apples" for the NOUNS above. */
const things = (n, noun) => (n === 1 ? `1 ${noun === 'leaves' ? 'leaf' : noun.replace(/s$/, '')}` : `${n} ${noun}`);
/** The numbers said counting on from a to n ("4, 5, 6" or "4, 5, ... up to 9"). */
const countOn = (a, n) => (n - a <= 3 ? Array.from({ length: n - a }, (_, i) => a + 1 + i).join(', ') : `${a + 1}, ${a + 2}, ... up to ${n}`);
export const TASKS = [
  T('fill-the-ten-frame', 'Fill the ten-frame', 'K.OA.A.4', 'K',
    'Show a number on the ten-frame: fill the top row first, then go on to the bottom row. How many more counters make 10?',
    'The 5-plus structure mirrors the rekenrek. Children should start reading the frame at a glance rather than counting every counter.',
    R => {
      const n = R.int(1, 9), kind = R.pick(['pos', 'neg']), noun = R.pick(NOUNS);
      const setup = countersBoard([{ k: 'ten-frame' }]), o = setup.objects[0];
      return {
        prompt: `There ${n === 1 ? 'is' : 'are'} ${things(n, noun)}. Show ${n} with ${COLOR[kind]} counters on the ten-frame: fill the top row first, then the bottom row. How many more make 10?`,
        setup, answer: { board: [{ t: 'frame', has: { [kind]: n }, order: true, say: `Put ${plural(n, `${COLOR[kind]} counter`)} in the frame, starting at the top left.` }], box: { key: String(10 - n), label: 'more to make 10' } },
        hints: ['Tap a counter in the palette, then drag it into the first cell. The next ones go into the next cells.', n >= 5 ? `The top row holds 5. Put ${n - 5} more on the bottom row.` : `Fill ${plural(n, 'cell')} of the top row.`, `${plural(n, 'cell')} ${n === 1 ? 'is' : 'are'} full and ${10 - n} are empty. ${n} + ${10 - n} = 10.`],
        explain: `${n} + ${10 - n} = 10. The empty cells show how many more make 10.`,
        solution: { board: { ...setup, pieces: inFrame(o, Array(n).fill(kind)) }, box: String(10 - n) },
      };
    }),
  T('zero-pairs', 'Zero pairs', '7.NS.A.1', '7',
    'Show a sum like 5 + (−3) with yellow and red counters. Pair each red with a yellow to make zero pairs, then read the answer.',
    'Zero pairs are the engine of integer addition. Insist children physically pair the counters before removing them, so the canceling is seen, not memorized.',
    R => {
      let a, b; do { a = R.int(1, 9); b = R.int(1, 9); } while (a === b);
      const setup = countersBoard([{ k: 'mat' }]);
      return {
        prompt: `Show ${a} + (−${b}): put out ${yr(a, b)}. Pair each red with a yellow to make zero pairs. What is ${a} + (−${b})?`,
        setup, answer: { board: [{ t: 'counts', has: has(a, b), say: `Put out ${yr(a, b)}.` }], box: intBox(a - b, 'the sum') },
        hints: ['A yellow is +1 and a red is −1. One of each makes a zero pair, worth 0.', `Make ${plural(Math.min(a, b), 'zero pair')}. What is left over?`, `${Math.abs(a - b)} ${a > b ? 'yellow' : 'red'} ${Math.abs(a - b) === 1 ? 'is' : 'are'} left, so ${a} + (−${b}) = ${sign(a - b)}.`],
        explain: `${a} + (−${b}) = ${sign(a - b)}. The ${plural(Math.min(a, b), 'zero pair')} ${Math.min(a, b) === 1 ? 'is' : 'are'} worth 0; the leftover ${a > b ? 'yellow' : 'red'} counters give the answer.`,
        solution: { board: { ...setup, pieces: rowsAt([...Array(a).fill('pos'), ...Array(b).fill('neg')], 1700, 1500, 10) }, box: String(a - b) },
      };
    }),
  T('part-part-whole-hunt', 'Part-part-whole hunt', '1.OA.B.3', '1',
    'Put yellow counters in one part of the part-part-whole mat and red counters in the other. Pick the number sentence the mat also shows.',
    'One arrangement gives four sentences (two additions, two subtractions). This is the fact-family idea in concrete form.',
    R => {
      const a = R.int(2, 7), b = R.int(1, 7), n = a + b;
      const setup = countersBoard([{ k: 'ppw', s: 1.4 }]), o = setup.objects[0];
      const opts = R.shuffle([`${n} − ${a} = ${b}`, `${a} − ${b} = ${n}`, `${n} + ${a} = ${b}`]), correct = opts.indexOf(`${n} − ${a} = ${b}`);
      return {
        prompt: `Make ${n}: put ${plural(a, 'yellow counter')} in one part and ${plural(b, 'red counter')} in the other part. ${a} + ${b} = ${n}. Which other sentence does the mat show?`,
        setup, answer: { board: [{ t: 'ppw', a: { pos: a }, b: { neg: b }, say: `Put ${a} yellow in one part and ${b} red in the other part.` }], choice: { options: opts, correct, say: 'Take one part away from the whole: what is left?' } },
        hints: ['The two boxes at the bottom are the parts. Drag counters into them.', `The whole is ${n}. If you take away the ${a} yellow, what part is left?`, `${n} − ${a} = ${b}: take one part from the whole and the other part is left.`],
        explain: `${a} + ${b} = ${n}, ${b} + ${a} = ${n}, ${n} − ${a} = ${b} and ${n} − ${b} = ${a}: one mat shows all four.`,
        solution: { board: { ...setup, pieces: [...inPart(o, 'a', Array(a).fill('pos')), ...inPart(o, 'b', Array(b).fill('neg'))] }, choice: correct },
      };
    }),
  T('subtracting-a-negative', 'Subtracting a negative', '7.NS.A.1c', '7',
    'Start with some yellow counters. Add zero pairs, then take away red counters. What is 4 − (−2)?',
    'Adding zero pairs first is the key move: it creates red counters that can be removed. Connect it to adding the opposite afterwards.',
    R => {
      const a = R.int(1, 9), b = R.int(1, 8);
      const setup = countersBoard([{ k: 'mat' }]);
      setup.pieces = rowsAt(Array(a).fill('pos'), 1700, 1450, 10);
      return {
        prompt: `The board shows ${a}. To take away ${plural(b, 'red counter')}, first add ${plural(b, 'zero pair')} (a yellow and a red each). Then take away ${b} red. What is ${a} − (−${b})?`,
        setup, answer: { board: [{ t: 'counts', has: has(a + b, 0), say: `Add ${plural(b, 'zero pair')}, then take away the ${plural(b, 'red counter')}.` }], box: intBox(a + b, 'the answer') },
        hints: [`There are no red counters to take away yet. Add ${b} yellow and ${b} red: that adds 0.`, b === 1 ? 'Now hold the red counter and pick Delete.' : `Now hold each red counter and pick Delete, ${b} times.`, `${a + b} yellow are left: ${a} − (−${b}) = ${a + b}.`],
        explain: `${a} − (−${b}) = ${a} + ${b} = ${a + b}. Taking away a red does the same as adding a yellow.`,
        solution: { board: { ...setup, pieces: rowsAt(Array(a + b).fill('pos'), 1700, 1450, 10) }, box: String(a + b) },
      };
    }),
  T('make-10-in-a-frame', 'Make 10 in a frame', 'K.OA.A.4', 'K',
    'Fill a ten-frame with 10 yellow counters, then flip some to red. How many yellow are left?',
    'Flipping keeps the total at 10 while changing the parts. Children should read both 7 + 3 and 10 - 3 from the same frame.',
    R => {
      const k = R.int(1, 9), noun = R.pick(['apples', 'balloons', 'tulips', 'buttons', 'hats', 'beads', 'leaves', 'stars']);
      const setup = countersBoard([{ k: 'ten-frame' }]), o = setup.objects[0];
      return {
        prompt: `There are 10 ${noun}. Fill the ten-frame with 10 yellow counters. Then flip ${k} of them to red. How many yellow are left?`,
        setup, answer: { board: [{ t: 'frame', has: has(10 - k, k), say: `Fill all 10 cells, then flip ${plural(k, 'counter')} to red.` }], box: { key: String(10 - k), label: 'yellow left' } },
        hints: ['Drag a yellow counter into the first cell, then tap the yellow counter in the palette until the frame is full.', `Hold a counter and pick Flip to make it red. Do that ${times(k)}.`, `10 − ${k} = ${10 - k}, and ${10 - k} + ${k} = 10.`],
        explain: `${10 - k} yellow and ${k} red still make 10: ${10 - k} + ${k} = 10 and 10 − ${k} = ${10 - k}.`,
        solution: { board: { ...setup, pieces: inFrame(o, [...Array(10 - k).fill('pos'), ...Array(k).fill('neg')]) }, box: String(10 - k) },
      };
    }),
  T('integer-climb', 'Integer climb', '7.NS.A.1b', '7',
    'Start at a negative number with red counters. Add yellow counters, pairing zeros as you go. Where do you finish?',
    'Pairing as you add prevents a messy pile and shows why -4 + 7 is positive 3, not 11.',
    R => {
      let a, b; do { a = R.int(1, 9); b = R.int(1, 12); } while (a === b);
      const setup = countersBoard([{ k: 'mat' }]);
      setup.pieces = rowsAt(Array(a).fill('neg'), 1700, 1450, 10);
      return {
        prompt: `The red counters show −${a}. Add ${plural(b, 'yellow counter')}. You may take away each zero pair as you make it. What is −${a} + ${b}?`,
        setup, answer: { board: [{ t: 'value', n: b - a, say: `Add ${plural(b, 'yellow counter')} to the −${a}.` }], box: intBox(b - a, 'the sum') },
        hints: [`Add ${plural(b, 'yellow counter')}. Each yellow with a red makes a zero pair.`, `${plural(Math.min(a, b), 'zero pair')} ${Math.min(a, b) === 1 ? 'is' : 'are'} worth 0. What is left over?`, `${Math.abs(b - a)} ${b > a ? 'yellow' : 'red'} left: −${a} + ${b} = ${sign(b - a)}.`],
        explain: `−${a} + ${b} = ${sign(b - a)}. The zero pairs cancel; the leftover ${b > a ? 'yellow' : 'red'} counters give the answer.`,
        solution: { board: { ...setup, pieces: rowsAt([...Array(a).fill('neg'), ...Array(b).fill('pos')], 1700, 1450, 10) }, box: String(b - a) },
      };
    }),
  T('two-colors-one-total', 'Two colors, one total', '7.NS.A.1', '7',
    'Use exactly some number of counters, yellow and red, so the value is a given number. How many red counters did you use?',
    'This is a small system in disguise: total counters and net value together fix both colors. Let children trial and adjust.',
    R => {
      let t, v; do { t = R.int(5, 15); v = R.int(-t + 2, t - 2); } while ((t + v) % 2 || v === 0);
      const pos = (t + v) / 2, neg = t - pos;
      const setup = countersBoard([{ k: 'mat' }]);
      return {
        prompt: `Use exactly ${t} counters, some yellow and some red, so that their value is ${sign(v)}. How many red counters did you use?`,
        setup, answer: { board: [{ t: 'counts', has: has(pos, neg), say: `Use ${t} counters in all with a value of ${sign(v)}.` }], box: { key: String(neg), label: 'red counters' } },
        hints: [`Start with ${t} yellow: the value is ${t}. Each yellow you flip to red makes the value 2 less.`, `Keep flipping until the value is ${sign(v)}. Count the red ones.`, `${pos} yellow and ${neg} red: ${pos} + ${neg} = ${t} and ${pos} − ${neg} = ${sign(v)}.`],
        explain: `${pos} yellow and ${neg} red use ${t} counters, and ${pos} + (−${neg}) = ${sign(v)}.`,
        solution: { board: { ...setup, pieces: rowsAt([...Array(pos).fill('pos'), ...Array(neg).fill('neg')], 1700, 1450, 10) }, box: String(neg) },
      };
    }),
  T('probability-counters', 'Probability counters', '7.SP.C.5', '7',
    'Put yellow and red counters in a bag model on the mat. If you pick one without looking, which color is more likely?',
    'Use counters to model chance language: more likely, less likely, equally likely. Keep numbers small so the comparison is clear.',
    R => {
      const y = R.int(1, 9), r = R.chance(0.15) ? y : R.int(1, 9);
      const setup = countersBoard([{ k: 'mat', label: 'Bag' }]), o = setup.objects[0];
      const options = ['Yellow', 'Red', 'Equally likely'], correct = y > r ? 0 : y < r ? 1 : 2;
      return {
        prompt: `Put ${yr(y, r)} on the Bag mat. You pick one counter without looking. Which color is more likely?`,
        setup, answer: { board: [{ t: 'counts', has: has(y, r), say: `Put ${yr(y, r)} on the mat.` }], choice: { options, correct, say: 'Which color has more counters in the bag?' } },
        hints: ['Each counter has the same chance to be picked.', 'The color with more counters is more likely. The same number: equally likely.', `${y} yellow and ${r} red: ${correct === 2 ? 'the same, so they are equally likely' : `${options[correct].toLowerCase()} is more likely`}.`],
        explain: `Yellow has ${plural(y, 'chance')} out of ${y + r} and red has ${r} out of ${y + r}. ${correct === 2 ? 'They are equally likely.' : `${options[correct]} is more likely.`}`,
        solution: { board: { ...setup, pieces: rowsAt([...Array(y).fill('pos'), ...Array(r).fill('neg')], o.x + 16, o.y + OBJ_HEAD + 16, 7) }, choice: correct },
      };
    }),
  T('groups-of-counters', 'Groups of counters', '3.OA.B.5', '3',
    'Make equal groups of yellow counters. Then put the same counters into a different number of equal groups. How many are in each group now?',
    'Rearranging groups shows commutativity of multiplication concretely before symbols are introduced.',
    R => {
      let a, b; do { a = R.int(2, 7); b = R.int(2, 7); } while (a === b);
      const setup = countersBoard([{ k: 'mat' }]);
      return {
        prompt: `Make ${a} groups of ${b} yellow counters. Then share the same counters into ${b} equal groups. How many counters are in each group now?`,
        setup, answer: { board: [{ t: 'counts', has: has(a * b, 0), say: `Use ${a} groups of ${b}: ${a * b} yellow counters.` }], box: { key: String(a), label: 'in each group' } },
        hints: [`${a} groups of ${b} is ${a * b} counters.`, `Now make ${b} groups from the same ${a * b}. Deal them out one at a time.`, `${b} groups of ${a} is also ${a * b}, so there are ${a} in each group.`],
        explain: `${a} × ${b} = ${b} × ${a} = ${a * b}. The total stayed the same; only the grouping changed.`,
        solution: { board: { ...setup, pieces: rowsAt(Array(a * b).fill('pos'), 1700, 1450, b) }, box: String(a) },
      };
    }),
  T('negative-take-away', 'Negative take away', '7.NS.A.1c', '7',
    'Start with red counters and add zero pairs until you can take away yellow counters. Show -2 - 5 and the result.',
    'Taking away counters you do not have is why zero pairs exist. Narrate each added pair as adding zero, so the value does not change.',
    R => {
      const a = R.int(1, 9), b = R.int(1, 8);
      const setup = countersBoard([{ k: 'mat' }]);
      setup.pieces = rowsAt(Array(a).fill('neg'), 1700, 1450, 10);
      return {
        prompt: `The red counters show −${a}. To take away ${b} yellow, first add ${plural(b, 'zero pair')}. Then take away ${b} yellow. What is −${a} − ${b}?`,
        setup, answer: { board: [{ t: 'counts', has: has(0, a + b), say: `Add ${plural(b, 'zero pair')}, then take away the ${plural(b, 'yellow counter')}.` }], box: intBox(-(a + b), 'the answer') },
        hints: [`There are no yellow counters to take away. Add ${b} yellow and ${b} red: that adds 0.`, b === 1 ? 'Now hold the yellow counter and pick Delete.' : `Now hold each yellow counter and pick Delete, ${b} times.`, `${a + b} red are left: −${a} − ${b} = −${a + b}.`],
        explain: `−${a} − ${b} = −${a + b}. Taking away ${b} yellow leaves ${b} more red than before.`,
        solution: { board: { ...setup, pieces: rowsAt(Array(a + b).fill('neg'), 1700, 1450, 10) }, box: String(-(a + b)) },
      };
    }),
  T('fraction-of-a-set', 'Fraction of a set', '3.NF.A.1', '3',
    'Lay out a set of counters and make a fraction of them red, the rest yellow. How many are red?',
    'The whole is the set of 12, not a single shape. Dividing the set into equal groups is the key move.',
    R => {
      const [n, d] = R.pick([[6, 2], [6, 3], [8, 2], [8, 4], [9, 3], [10, 2], [10, 5], [12, 2], [12, 3], [12, 4], [12, 6], [15, 3], [15, 5], [16, 4], [16, 8], [18, 3], [18, 6], [20, 4], [20, 5]]);
      const k = R.int(1, d - 1), red = (n / d) * k;
      const setup = countersBoard([{ k: 'mat' }]);
      return {
        prompt: `Lay out ${n} counters. Make ${k}/${d} of them red and the rest yellow. How many counters are red?`,
        setup, answer: { board: [{ t: 'counts', has: has(n - red, red), say: `Use ${n} counters with ${k}/${d} of them red.` }], box: { key: String(red), label: 'red counters' } },
        hints: [`Split the ${n} counters into ${d} equal groups. How many are in each group?`, `Each group has ${n / d}. ${k}/${d} means ${k} of those groups.`, `${plural(k, 'group')} of ${n / d} ${k === 1 ? 'is' : 'makes'} ${red}: make ${red} red and ${n - red} yellow.`],
        explain: `${n} ÷ ${d} = ${n / d} in each group, so ${k}/${d} of ${n} is ${k} × ${n / d} = ${red}.`,
        solution: { board: { ...setup, pieces: rowsAt([...Array(red).fill('neg'), ...Array(n - red).fill('pos')], 1700, 1450, n / d) }, box: String(red) },
      };
    }),
  T('pattern-with-counters', 'Pattern with counters', '4.OA.C.5', '4',
    'Build a growing pattern: stage 1 has 1 counter, stage 2 has 2 in the other color, and so on. How many counters by a later stage?',
    'Recording stage totals in a table helps children see the pattern rule rather than just extending shapes.',
    R => {
      const m = R.int(3, 5), n = R.int(m + 1, 12), first = R.pick(['pos', 'neg']), other = first === 'pos' ? 'neg' : 'pos';
      let a = 0, b = 0; for (let s = 1; s <= m; s++) { if (s % 2) a += s; else b += s; }
      const tot = (n * (n + 1)) / 2, list = [];
      for (let s = 1; s <= m; s++) list.push(...Array(s).fill(s % 2 ? first : other));
      const setup = countersBoard([{ k: 'mat' }]);
      return {
        prompt: `Build stages 1 to ${m} of a pattern: 1 ${COLOR[first]}, then 2 ${COLOR[other]}, then 3 ${COLOR[first]}, and so on. How many counters are there in all from stage 1 to stage ${n}?`,
        setup, answer: { board: [{ t: 'counts', has: { [first]: a, [other]: b }, say: `Build stages 1 to ${m}: each stage has one more counter, in the other color.` }], box: { key: String(tot), label: 'counters in all' } },
        hints: [`Stage ${m} has ${m} counters. The first ${m} stages use ${(m * (m + 1)) / 2}.`, `Keep adding: stage ${m + 1} adds ${m + 1}, stage ${m + 2} adds ${m + 2}...`, `1 + 2 + ... + ${n} = ${tot}.`],
        explain: `Each stage adds one more counter than the one before, so the total is 1 + 2 + ... + ${n} = ${tot}.`,
        solution: { board: { ...setup, pieces: rowsAt(list, 1700, 1450, 12) }, box: String(tot) },
      };
    }),
  T('balance-the-mat', 'Balance the mat', '1.OA.B.4', '1',
    'The part-part-whole mat shows the whole and one part. Fill the other part and type the subtraction it shows.',
    'The missing part is found by counting on from 3 to 8. Connect that counting-on to subtraction explicitly.',
    R => {
      const n = R.int(5, 12), a = R.int(1, n - 2), m = n - a;
      const setup = countersBoard([{ k: 'ppw', s: 1.4, fill: o => [...inPart(o, 'whole', Array(n).fill('pos'), true), ...inPart(o, 'a', Array(a).fill('pos'), true)] }]), o = setup.objects[0];
      return {
        prompt: `The whole is ${n}. One part has ${a}. Put red counters in the empty part to show the missing part. What is ${n} − ${a}?`,
        setup, answer: { board: [{ t: 'ppw', a: { pos: a }, b: { neg: m }, whole: { pos: n }, say: `Put red counters in the empty part until the two parts make ${n}.` }], box: { key: String(m), label: `${n} − ${a}` } },
        hints: [`Count on from ${a}: ${countOn(a, n)}. Put a red counter for each number you say.`, `The two parts together must make the whole, ${n}.`, `${a} + ${m} = ${n}, so ${n} − ${a} = ${m}.`],
        explain: `${a} + ${m} = ${n}, so ${n} − ${a} = ${m}. Counting on from one part finds the other.`,
        solution: { board: { ...setup, pieces: [...setup.pieces, ...inPart(o, 'b', Array(m).fill('neg'))] }, box: String(m) },
      };
    }),
  T('zero-pair-detective', 'Zero pair detective', '7.NS.A.1a', '7',
    'A mat shows yellow and red counters mixed together. Take away the zero pairs. What is the value?',
    'Pairing is the proof. Children should physically match counters until none are left unpaired.',
    R => {
      const y = R.int(2, 9), r = R.chance(0.2) ? y : R.int(2, 9), list = R.shuffle([...Array(y).fill('pos'), ...Array(r).fill('neg')]);
      const setup = countersBoard([], { loose: { list, R } });
      const left = y > r ? 'pos' : 'neg';
      return {
        prompt: 'Yellow and red counters are mixed together. Take away the zero pairs (one yellow and one red at a time) until one color is left. What is the value?', sig: `${y} ${r} ${list.join('')}`,
        setup, answer: { board: [{ t: 'noPairs', say: 'Take away zero pairs until only one color is left.' }, { t: 'value', n: y - r, say: 'Take away a yellow and a red together each time.' }], box: intBox(y - r, 'the value') },
        hints: ['Hold a yellow and pick Delete, then do the same with a red: that takes away one zero pair, worth 0.', 'Keep going until no yellow-and-red pair is left.', y === r ? 'Every counter has a partner, so the value is 0.' : `${Math.abs(y - r)} ${COLOR[left]} ${Math.abs(y - r) === 1 ? 'is' : 'are'} left, so the value is ${sign(y - r)}.`],
        explain: `${y} yellow and ${r} red make ${Math.min(y, r)} zero pairs. ${y === r ? 'Nothing is left over: the value is 0.' : `What is left over, ${Math.abs(y - r)} ${COLOR[left]}, is the value: ${sign(y - r)}.`}`,
        solution: { board: { ...setup, pieces: setup.pieces.filter(p => p.kind === left).slice(0, Math.abs(y - r)) }, box: String(y - r) },
      };
    }),
  T('double-and-halve', 'Double and halve', '3.OA.B.6', '3',
    'Double a set of counters, or halve one by flipping half of them. Find the number that is doubled or halved.',
    'Doubling and halving with objects makes inverse operations visible. Ask for the number sentences afterwards.',
    R => {
      const n = R.int(3, 12), dbl = R.chance(), noun = R.pick(NOUNS);
      const setup = countersBoard([{ k: 'mat' }]);
      setup.pieces = rowsAt(Array(dbl ? n : 2 * n).fill('pos'), 1700, 1450, dbl ? n : 12);
      return dbl ? {
        prompt: `There are ${n} ${noun}, one yellow counter for each. Double them: add one red counter for each yellow. How many counters are there now?`,
        setup, answer: { board: [{ t: 'counts', has: has(n, n), say: `Add one red counter for each of the ${n} yellow.` }], box: { key: String(2 * n), label: 'counters now' } },
        hints: [`Doubling means two of the same: add ${n} red counters.`, `${n} yellow and ${n} red. Count them all.`, `${n} + ${n} = 2 × ${n} = ${2 * n}.`],
        explain: `Double ${n} is ${2 * n}, and half of ${2 * n} is ${n} again: 2 × ${n} = ${2 * n} and ${2 * n} ÷ 2 = ${n}.`,
        solution: { board: { ...setup, pieces: rowsAt([...Array(n).fill('pos'), ...Array(n).fill('neg')], 1700, 1450, n) }, box: String(2 * n) },
      } : {
        prompt: `There are ${2 * n} ${noun}, one yellow counter for each. Halve them: flip half of them to red. How many did you flip? What is ${2 * n} ÷ 2?`,
        setup, answer: { board: [{ t: 'counts', has: has(n, n), say: `Flip counters until yellow and red are the same, ${2 * n} in all.` }], box: { key: String(n), label: `${2 * n} ÷ 2` } },
        hints: ['Half means two equal parts: the same number of yellow and red.', `Flip one counter, then check: are there as many red as yellow? Keep going.`, `${n} yellow and ${n} red: ${2 * n} ÷ 2 = ${n}.`],
        explain: `${2 * n} ÷ 2 = ${n}, because 2 × ${n} = ${2 * n}. Halving undoes doubling.`,
        solution: { board: { ...setup, pieces: rowsAt([...Array(n).fill('pos'), ...Array(n).fill('neg')], 1700, 1450, 12) }, box: String(n) },
      };
    }),
  T('counters-for-data', 'Counters for data', '2.MD.D.10', '2',
    'Sort a mixed pile by color and line the groups up as bars. Which color has the most? How many more than the color with the fewest?',
    'A counter bar is a first bar graph. Aligning the start line matters for a fair comparison.',
    R => {
      const kinds = R.shuffle(['pos', 'neg', 'blue', 'green']).slice(0, 3);
      let ns; do { ns = kinds.map(() => R.int(2, 9)); } while (new Set(ns).size < 3);
      const list = R.shuffle(kinds.flatMap((k, i) => Array(ns[i]).fill(k)));
      const setup = countersBoard([], { loose: { list, R } });
      const hi = ns.indexOf(Math.max(...ns)), lo = ns.indexOf(Math.min(...ns)), d = ns[hi] - ns[lo];
      const options = kinds.map(k => COLOR[k][0].toUpperCase() + COLOR[k].slice(1));
      return {
        prompt: `Sort the counters by color and line each color up in a row, starting at the same place. Which color has the most? How many more does it have than ${COLOR[kinds[lo]]}?`, sig: `${kinds.join(' ')} ${ns.join(' ')} ${list.join('')}`,
        setup, answer: { choice: { options, correct: hi, say: 'Which row is the longest?' }, box: { key: String(d), label: `how many more than ${COLOR[kinds[lo]]}` } },
        hints: ['Drag the counters of each color into a row of their own, all starting at the left.', `The longest row has the most. Line it up with the ${COLOR[kinds[lo]]} row.`, `${options[hi]} has ${ns[hi]} and ${COLOR[kinds[lo]]} has ${ns[lo]}: ${ns[hi]} − ${ns[lo]} = ${d}.`],
        explain: `${kinds.map((k, i) => `${COLOR[k]} ${ns[i]}`).join(', ')}. The counters with no partner in the shorter row show the difference: ${d}.`,
        solution: { board: setup, choice: hi, box: String(d) },
      };
    }),
  T('add-unlike-signs', 'Add unlike signs', '7.NS.A.1b', '7',
    'Show a positive and a negative number together, take away the zero pairs, and read the result. The answer takes the sign of the larger group.',
    'The leftover color tells the sign. This image stays with children when they later meet rules for adding integers.',
    R => {
      let a, b; do { a = R.int(1, 12); b = R.int(1, 12); } while (a === b);
      const setup = countersBoard([{ k: 'mat' }]), big = a > b ? 'pos' : 'neg';
      return {
        prompt: `Show +${a} and −${b}: ${yr(a, b)}. Take away the zero pairs until one color is left. What is ${a} + (−${b})?`,
        setup, answer: { board: [{ t: 'counts', has: a > b ? has(a - b, 0) : has(0, b - a), say: `Show ${a} yellow and ${b} red, then take away every zero pair.` }], box: intBox(a - b, 'the sum') },
        hints: [`Put out ${a} yellow and ${b} red. Then take away a yellow and a red together, again and again.`, `After ${plural(Math.min(a, b), 'zero pair')}, only ${COLOR[big]} counters are left.`, `${Math.abs(a - b)} ${COLOR[big]} left: ${a} + (−${b}) = ${sign(a - b)}.`],
        explain: `${a} + (−${b}) = ${sign(a - b)}. There are more ${COLOR[big]} counters, so the leftovers are ${COLOR[big]} and the answer is ${a > b ? 'positive' : 'negative'}.`,
        solution: { board: { ...setup, pieces: rowsAt(Array(Math.abs(a - b)).fill(big), 1700, 1450, 10) }, box: String(a - b) },
      };
    }),
];
