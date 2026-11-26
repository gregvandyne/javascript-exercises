// Number Lines: the tool's 17 tasks as practice (docs/manip-practice-tasks.md). As in rekenreks.js: each task keeps its
// title, code, grade and notes; make(R) gives one variation; conds are this tool's board checks, read from the board's
// number line objects: their dots (st.points) and their jumps (st.jumps, [{ a, b }]: the last chain of jumps, each
// starting where the one before landed, is the number sentence the line writes). A line a student must only read (a
// point to name) is read only (st.q) with its dot drawn as "?" (st.ask). st.frac labels a line in halves, fourths or
// eighths as fractions (manip.js nlLabel).
import { boardWith, rowPlaces, objSizeOf, fmt, plural, countTo } from '../manip-task-kit.js';

export const SLUG = 'number-lines';
const EPS = 2e-3;

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const r3 = n => Math.round(n * 1000) / 1000;
/** A number line's state (the page's own fields; points and jumps empty unless given). */
const lineSt = ({ min = 0, max = 20, step = 1, hide = false, points = [], jumps = [], mode = 'points', frac = false, ask = false, q = false } = {}) => ({
  min, max, step, hide, points: points.map(r3), jumps, jumpFrom: jumps.length ? jumps[jumps.length - 1].b : null, mode,
  ...(frac ? { frac: true } : {}), ...(ask ? { ask: true } : {}), ...(q ? { q: true } : {}) });
/** A board with these number lines one under the other (ids l1, l2, ...). */
export function lineBoard(list) {
  const sts = list.map(lineSt), places = rowPlaces(sts.map(st => objSizeOf(SLUG, SLUG, st)));
  return boardWith(SLUG, sts.map((st, i) => ({ id: `l${i + 1}`, k: SLUG, x: places[i].x, y: places[i].y, s: 1, st })));
}
/** The same board with these dots added and these jumps made (a chain from `from` through `to` landings), for the
 *  solutions. */
function solved(setup, { points = [], chain = null }) {
  const b = JSON.parse(JSON.stringify(setup)), st = b.objects[0].st;
  st.points = [...st.points, ...points.map(r3)];
  if (chain) {
    let at = chain[0]; for (const to of chain.slice(1)) { st.jumps.push({ a: r3(at), b: r3(to) }); at = to; }
    st.jumpFrom = r3(at); st.mode = 'jumps';
  }
  return b;
}

// ---------------------------------------------------------------- the checks
/** The board's number lines as the checks read them: [{ points: [n], jumps: [{ a, b }] }]. */
export function linesOf(board) {
  return ((board && Array.isArray(board.objects)) ? board.objects : []).filter(o => o && o.k === SLUG && o.st && typeof o.st === 'object').map(o => ({
    points: (Array.isArray(o.st.points) ? o.st.points : []).map(Number).filter(Number.isFinite),
    jumps: (Array.isArray(o.st.jumps) ? o.st.jumps : []).filter(j => j && Number.isFinite(+j.a) && Number.isFinite(+j.b)).map(j => ({ a: +j.a, b: +j.b })),
  }));
}
const same = (a, b) => Math.abs(a - b) < EPS;
const uniq = list => list.reduce((out, x) => (out.some(y => same(x, y)) ? out : [...out, x]), []);
/** The last chain of jumps (as manip.js nlSentence reads it): [{ a, b }], [] when there are none. */
export function chainOf(jumps) {
  if (!jumps.length) return [];
  const run = [jumps[jumps.length - 1]];
  for (let i = jumps.length - 2; i >= 0 && same(jumps[i].b, run[0].a); i--) run.unshift(jumps[i]);
  return run;
}
const line = b => linesOf(b)[0] || null;
export const conds = {
  /** The dots are exactly these numbers (in any order). */
  points: (c, b) => { const l = line(b); if (!l) return false; const got = uniq(l.points); return got.length === c.at.length && c.at.every(x => got.some(y => same(x, y))); },
  /** Besides the given dots (keep), at least one more dot, every one of them strictly between lo and hi. */
  between: (c, b) => { const l = line(b); if (!l) return false; const rest = uniq(l.points).filter(p => !(c.keep || []).some(k => same(k, p))); return rest.length > 0 && rest.every(p => p > c.lo + EPS && p < c.hi - EPS); },
  /** The last chain of jumps starts at from and lands on to; n: how many jumps; sizes: each jump's size, in order;
   *  dir: 1 every jump forward (-1 back). */
  chain: (c, b) => {
    const l = line(b); if (!l) return false; const run = chainOf(l.jumps); if (!run.length) return false;
    if (!same(run[0].a, c.from) || !same(run[run.length - 1].b, c.to)) return false;
    if (c.n && run.length !== c.n) return false;
    if (c.sizes && !(c.sizes.length === run.length && c.sizes.every((d, i) => same(run[i].b - run[i].a, d)))) return false;
    return !c.dir || run.every(j => Math.sign(j.b - j.a) === c.dir);
  },
};

// ---------------------------------------------------------------- words
/** A number as kids write it: −4 (a real minus sign), 2.5. */
const sn = n => (n < 0 ? `−${fmt(-n)}` : fmt(n));
/** k/d in lowest terms, as a whole number when it is one: 2/4 -> 1/2, 8/4 -> 2. */
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const fr = (k, d) => { const g = gcd(k, d); return d / g === 1 ? String(k / g) : `${k / g}/${d / g}`; };
/** k/d as the line labels it (over d unless whole): 6/4, 2. */
const onLine = (k, d) => (k % d === 0 ? String(k / d) : `${k}/${d}`);
const list3 = a => `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
const clock = h => `${Math.floor(h)}:${h % 1 ? '30' : '00'}`;

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
export const TASKS = [
  T('jump-to-add', 'Jump to add', '2.OA.A.1', '2',
    'On a 0 to 20 line, use Jumps: start at one number and land on another in two jumps, landing on a ten first. How far did you jump in all?',
    'Breaking +8 into +5 and +3 (land on a ten first) is the bridging strategy. The arc makes the landing points visible.',
    R => {
      const a = R.int(2, 9), b = R.int(11, 19), setup = lineBoard([{ min: 0, max: 20, mode: 'jumps' }]);
      return {
        prompt: `On the 0 to 20 line, Jumps is on. Start at ${a} and land on ${b} in two jumps: jump to 10 first, then jump the rest. How far did you jump in all?`,
        setup, answer: { board: [{ t: 'chain', from: a, to: b, n: 2, dir: 1, say: `Tap ${a} to start, then make two jumps that land on ${b}.` }], box: { key: String(b - a), label: 'in all' } },
        hints: [`Tap ${a} to start. Then tap 10: that is a jump of ${10 - a}.`, `From 10, tap ${b}: that is a jump of ${b - 10}.`, `${10 - a} + ${b - 10} = ${b - a}. You jumped ${b - a} in all.`],
        explain: `${a} + ${10 - a} = 10 and 10 + ${b - 10} = ${b}, so ${a} + ${b - a} = ${b}. Landing on 10 first splits one big jump into two easy ones.`,
        solution: { board: solved(setup, { chain: [a, 10, b] }), box: String(b - a) },
      };
    }),
  T('mystery-point', 'Mystery point', '3.NBT.A.1', '3',
    'The labels are hidden. Use the ends of the line and its ticks to work out the number at the point.',
    'Estimation on an open line is pure number sense: children must use the endpoints and the halfway mark as anchors.',
    R => {
      const [max, step] = R.pick([[10, 1], [20, 2], [50, 5], [100, 10], [200, 20], [1000, 100]]), v = step * R.int(1, 9);
      const setup = lineBoard([{ min: 0, max, step, hide: true, points: [v], ask: true, q: true }]);
      return {
        prompt: `The labels are hidden. The line goes from 0 to ${fmt(max)}, and each tick is ${fmt(step)} more than the one before. What number is the point at?`, sig: `${max} ${v}`,
        setup, answer: { box: { key: String(v), label: 'the number' } },
        hints: [`The middle tick is halfway: ${fmt(max / 2)}. Is the point before or after it?`, `Count the ticks from 0 to the point, ${fmt(step)} each time.`, `The point is ${plural(v / step, 'tick')} from 0: ${v / step} × ${fmt(step)} = ${fmt(v)}.`],
        explain: `The point is at ${fmt(v)}. The ends and the halfway mark are anchors, and each tick adds ${fmt(step)}.`,
        solution: { board: setup, box: String(v) },
      };
    }),
  T('fractions-on-the-line', 'Fractions on the line', '3.NF.A.2b', '3',
    'On a 0 to 2 line in fourths, put dots at three fractions. Which two are the same distance from 1?',
    'Fractions as points on a line, not parts of a pizza, is the grade 3 leap. Improper fractions belong here on purpose.',
    R => {
      const k = R.int(1, 3), t = R.pick([1, 2, 3, 5, 6, 7].filter(x => x !== 4 - k && x !== 4 + k)), ks = R.shuffle([4 - k, 4 + k, t]);
      const names = ks.map(x => onLine(x, 4)), setup = lineBoard([{ min: 0, max: 2, step: 0.25, frac: true }]);
      const pairs = [[0, 1], [0, 2], [1, 2]], correct = pairs.findIndex(([i, j]) => ks[i] + ks[j] === 8), options = pairs.map(([i, j]) => `${names[i]} and ${names[j]}`);
      return {
        prompt: `On the 0 to 2 line in fourths, put dots at ${list3(names)}. Which two dots are the same distance from 1?`,
        setup, answer: { board: [{ t: 'points', at: ks.map(x => x / 4), say: `Put dots at ${list3(names)}, and no others.` }], choice: { options, correct, say: 'Count the fourths from 1 to each dot.' } },
        hints: ['Each tick is one fourth. 4/4 is the same as 1.', `Count the jumps of one fourth from 1 to each dot.`, `${onLine(4 - k, 4)} and ${onLine(4 + k, 4)} are both ${onLine(k, 4)} away from 1.`],
        explain: `${onLine(4 - k, 4)} is ${onLine(k, 4)} less than 1 and ${onLine(4 + k, 4)} is ${onLine(k, 4)} more, so they are the same distance from 1, one on each side.`,
        solution: { board: solved(setup, { points: ks.map(x => x / 4) }), choice: correct },
      };
    }),
  T('negative-jumps', 'Negative jumps', '6.NS.C.6', '6',
    'On a −10 to 10 line, start at a number and jump back across 0. Where do you land? Then make one more jump to a given number.',
    'Crossing zero is where errors cluster. The arc crossing the 0 tick gives children a landmark to count through.',
    R => {
      const a = R.int(1, 8), d = R.int(a + 1, Math.min(10, a + 10)), L = a - d;
      const t = R.pick(Array.from({ length: 21 }, (_, i) => i - 10).filter(x => x !== L && x !== a));
      const setup = lineBoard([{ min: -10, max: 10, mode: 'jumps' }]);
      return {
        prompt: `Jumps is on. Start at ${a} and make a jump of −${d}. Where do you land? Then make one more jump that lands exactly on ${sn(t)}.`,
        setup, answer: { board: [{ t: 'chain', from: a, to: t, sizes: [-d, t - L], say: `Tap ${a}, jump ${d} to the left, then jump to ${sn(t)}.` }], box: { key: String(L), label: 'where you land' } },
        hints: [`Tap ${a} to start. A jump of −${d} goes ${d} to the left.`, `${a} to 0 is ${plural(a, 'step')}. ${plural(d - a, 'more step', 'more steps')} to the left ${d - a === 1 ? 'lands' : 'land'} on ${sn(L)}.`, `You land on ${sn(L)}. Then tap ${sn(t)} for the last jump.`],
        explain: `${a} − ${d} = ${sn(L)}: ${a} back to 0, then ${d - a} more below 0. From ${sn(L)}, a jump of ${t - L > 0 ? '+' : '−'}${Math.abs(t - L)} lands on ${sn(t)}.`,
        solution: { board: solved(setup, { chain: [a, L, t] }), box: String(L) },
      };
    }),
  T('round-on-the-line', 'Round on the line', '3.NBT.A.1', '3',
    'Mark a number on a line between two hundreds. Which hundred is it nearer?',
    'Position between hundreds shows nearness directly: 348 sits just before the halfway point of 350.',
    R => {
      const H = 100 * R.int(1, 9), k = R.pick([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19]), n = H + 5 * k, r = Math.round(n / 100) * 100;
      const setup = lineBoard([{ min: H, max: H + 100, step: 5 }]);
      return {
        prompt: `Put a dot at ${n} on the ${H} to ${H + 100} line. Round ${n} to the nearest hundred.`,
        setup, answer: { board: [{ t: 'points', at: [n], say: `Put one dot at ${n}.` }], box: { key: String(r), label: 'nearest hundred' } },
        hints: [`The halfway point is ${H + 50}. Is ${n} before it or after it?`, `${n} is ${n - H} from ${H} and ${H + 100 - n} from ${H + 100}.`, `${n} is nearer ${r}.`],
        explain: `${n} rounds to ${r}: it sits on the ${n < H + 50 ? `${H} side` : `${H + 100} side`} of the halfway point, ${H + 50}.`,
        solution: { board: solved(setup, { points: [n] }), box: String(r) },
      };
    }),
  T('decimal-steps', 'Decimal steps', '5.NBT.B.7', '5',
    'On a 0 to 1 line in tenths, plot three decimals, then jump from one to another and name the jump.',
    'The jump is +0.6, six tenths steps. Counting steps in tenths reinforces decimal place value.',
    R => {
      const [x, y] = R.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2), a = Math.min(x, y), c = Math.max(x, y);
      const b = R.pick([1, 2, 3, 4, 5, 6, 7, 8, 9].filter(z => z !== a && z !== c)), pts = R.shuffle([a, b, c]).map(z => z / 10);
      const setup = lineBoard([{ min: 0, max: 1, step: 0.1 }]);
      return {
        prompt: `On the 0 to 1 line, put dots at ${list3(pts.map(fmt))}. Then switch to Jumps and jump from ${fmt(a / 10)} to ${fmt(c / 10)}. How big is the jump?`,
        setup, answer: { board: [{ t: 'points', at: pts, say: `Put dots at ${list3(pts.map(fmt))}.` }, { t: 'chain', from: a / 10, to: c / 10, n: 1, say: `Switch to Jumps, tap ${fmt(a / 10)}, then tap ${fmt(c / 10)}.` }], box: { key: fmt((c - a) / 10), label: 'the jump' } },
        hints: ['Each tick is one tenth: 0.1.', `Count the tenths from ${fmt(a / 10)} to ${fmt(c / 10)}.`, `That is ${plural(c - a, 'tenth')}: a jump of ${fmt((c - a) / 10)}.`],
        explain: `${fmt(a / 10)} + ${fmt((c - a) / 10)} = ${fmt(c / 10)}. ${plural(c - a, 'step')} of one tenth ${c - a === 1 ? 'makes' : 'make'} ${fmt((c - a) / 10)}.`,
        solution: { board: solved(setup, { points: pts, chain: [a / 10, c / 10] }), box: fmt((c - a) / 10) },
      };
    }),
  T('temperature-line', 'Temperature line', '6.NS.C.7', '6',
    'Plot a temperature below zero, zero and one above zero on a −20 to 30 line. How much warmer is the warm one?',
    'The distance across zero is 23 degrees. Crossing zero must be counted in two parts, 5 and 18.',
    R => {
      const lo = -R.int(1, 19), hi = R.int(1, 29), setup = lineBoard([{ min: -20, max: 30 }]);
      return {
        prompt: `The line shows temperatures from −20° to 30°. Put dots at ${sn(lo)}°, 0° and ${hi}°. How many degrees warmer is ${hi}° than ${sn(lo)}°?`,
        setup, answer: { board: [{ t: 'points', at: [lo, 0, hi], say: `Put dots at ${sn(lo)}, 0 and ${hi}.` }], box: { key: String(hi - lo), label: 'degrees warmer' } },
        hints: [`Count in two parts: from ${sn(lo)}° up to 0°, then from 0° up to ${hi}°.`, `${sn(lo)}° to 0° is ${plural(-lo, 'degree')}. 0° to ${hi}° is ${plural(hi, 'degree')}.`, `${-lo} + ${hi} = ${hi - lo} degrees.`],
        explain: `${hi}° is ${hi - lo} degrees warmer than ${sn(lo)}°: ${plural(-lo, 'degree')} up to 0, then ${hi} more.`,
        solution: { board: solved(setup, { points: [lo, 0, hi] }), box: String(hi - lo) },
      };
    }),
  T('fraction-between-fractions', 'Fraction between fractions', '4.NF.A.2', '4',
    'On a line in eighths, two fractions are marked. Put a dot at a fraction between them.',
    '3/8 sits between 2/8 and 4/8. Renaming to eighths is the move that makes between-ness visible.',
    R => {
      const a = R.int(0, 13), b = a + R.int(2, Math.min(4, 16 - a)), lo = a / 8, hi = b / 8;
      const setup = lineBoard([{ min: 0, max: 2, step: 0.125, frac: true, points: [lo, hi] }]);
      return {
        prompt: `On the line in eighths, the dots show ${fr(a, 8)} and ${fr(b, 8)}. Put one more dot at a fraction between them.`,
        setup, answer: { board: [{ t: 'between', lo, hi, keep: [lo, hi], say: `Put a dot after ${fr(a, 8)} and before ${fr(b, 8)}.` }] },
        hints: [`Write both in eighths: ${fr(a, 8)} is ${a}/8 and ${fr(b, 8)} is ${b}/8.`, `Any eighth between ${a}/8 and ${b}/8 works, like ${a + 1}/8.`, `Tap the tick for ${a + 1}/8.`],
        explain: `${fr(a, 8)} = ${a}/8 and ${fr(b, 8)} = ${b}/8, so ${a + 1}/8 is between them. Renaming in eighths shows the fractions in between.`,
        solution: { board: solved(setup, { points: [(a + 1) / 8] }) },
      };
    }),
  T('jump-strategy-48-25', 'Jump strategy for adding', '2.NBT.B.5', '2',
    'Start at a number. Jump the tens, then jump to the next ten, then jump the rest. Where do you land?',
    '48 + 20 = 68, +2 = 70, +3 = 73. Landing on a ten mid-addition is the bridging strategy on a line.',
    R => {
      let a, b; do { a = 10 * R.int(1, 8) + R.int(2, 8); b = 10 * R.int(1, 2) + R.int(1, 9); } while ((a % 10) + (b % 10) <= 10);
      const tens = 10 * Math.floor(b / 10), r1 = 10 - (a % 10), r2 = (b % 10) - r1, m0 = 10 * Math.floor(a / 10);
      const setup = lineBoard([{ min: m0, max: m0 + 40, mode: 'jumps' }]);
      return {
        prompt: `Jumps is on. Start at ${a} and add ${b} in three jumps: jump ${tens}, then jump to the next ten, then jump the rest. Where do you land?`,
        setup, answer: { board: [{ t: 'chain', from: a, to: a + b, sizes: [tens, r1, r2], say: `Tap ${a}, then jump ${tens}, then to the next ten, then the rest.` }], box: { key: String(a + b), label: 'where you land' } },
        hints: [`Tap ${a} to start, then tap ${a + tens}: a jump of ${tens}.`, `From ${a + tens}, the next ten is ${a + tens + r1}: a jump of ${r1}.`, `${b % 10} - ${r1} = ${r2} more: jump to ${a + b}.`],
        explain: `${a} + ${tens} = ${a + tens}, + ${r1} = ${a + tens + r1}, + ${r2} = ${a + b}. Landing on a ten in the middle makes the last jump easy.`,
        solution: { board: solved(setup, { chain: [a, a + tens, a + tens + r1, a + b] }), box: String(a + b) },
      };
    }),
  T('elapsed-on-a-line', 'Elapsed on a line', '3.MD.A.1', '3',
    'Mark two times as points on a time line (2:30 is 2.5). How many hours are between them?',
    'Lines turn clock time into distance: 2.5 hours. This prepares for decimal time calculations.',
    R => {
      const s = R.int(2, 17), e = R.int(s + 1, Math.min(24, s + 10)), S = s / 2, E = e / 2, setup = lineBoard([{ min: 0, max: 12, step: 0.5 }]);
      return {
        prompt: `On this time line, 2:30 is at 2.5 and 5:00 is at 5. Put dots at the times ${clock(S)} and ${clock(E)}. How many hours is it from ${clock(S)} to ${clock(E)}?`,
        setup, answer: { board: [{ t: 'points', at: [S, E], say: `Put dots at ${fmt(S)} and ${fmt(E)}.` }], box: { key: fmt(E - S), label: 'hours' } },
        hints: [`${clock(S)} is at ${fmt(S)} and ${clock(E)} is at ${fmt(E)}. Each tick is half an hour.`, `Count the half hours from ${fmt(S)} to ${fmt(E)}: there are ${e - s}.`, `${plural(e - s, 'half hour')} is ${plural(E - S, 'hour')}.`],
        explain: `From ${clock(S)} to ${clock(E)} is ${plural(E - S, 'hour')}: ${fmt(E)} - ${fmt(S)} = ${fmt(E - S)}.`,
        solution: { board: solved(setup, { points: [S, E] }), box: fmt(E - S) },
      };
    }),
  T('multiply-as-jumps', 'Multiply as jumps', '3.OA.A.1', '3',
    'Show equal jumps from 0 on a line. Where do you land, and what multiplication have you drawn?',
    'Equal jumps are multiplication as repeated addition. Unequal jumps would break the model, which is worth discussing.',
    R => {
      let k, s; do { k = R.int(2, 6); s = R.int(2, 9); } while (k * s > 40);
      const setup = lineBoard([{ min: 0, max: 40, mode: 'jumps' }]), stops = Array.from({ length: k + 1 }, (_, i) => i * s);
      return {
        prompt: `Jumps is on. Start at 0 and make ${k} jumps of ${s}. Where do you land? That is ${k} × ${s}.`,
        setup, answer: { board: [{ t: 'chain', from: 0, to: k * s, sizes: Array(k).fill(s), say: `Tap 0, then make ${k} jumps of ${s} each.` }], box: { key: String(k * s), label: 'where you land' } },
        hints: [`Tap 0 to start, then tap ${s}: one jump of ${s}.`, `Keep jumping ${s} each time: ${stops.slice(1, 4).join(', ')}${k > 3 ? ', ...' : ''}`, `${k} jumps of ${s} land on ${k * s}: ${k} × ${s} = ${k * s}.`],
        explain: `${Array(k).fill(s).join(' + ')} = ${k * s}, so ${k} × ${s} = ${k * s}. Equal jumps are multiplication.`,
        solution: { board: solved(setup, { chain: stops }), box: String(k * s) },
      };
    }),
  T('negative-ordering', 'Negative ordering', '6.NS.C.7a', '6',
    'Plot some negative numbers and 0 on a line. Which number is the smallest?',
    'On the line, left means smaller. Distance from zero is size of the number, position gives the order for negatives.',
    R => {
      const pts = R.shuffle(Array.from({ length: 11 }, (_, i) => -i)).slice(0, 4), setup = lineBoard([{ min: -10, max: 10 }]);
      const small = Math.min(...pts), options = pts.map(sn), correct = pts.indexOf(small);
      return {
        prompt: `Put dots at ${list3(pts.map(sn))}. Which number is the smallest?`,
        setup, answer: { board: [{ t: 'points', at: pts, say: `Put dots at ${list3(pts.map(sn))}.` }], choice: { options, correct, say: 'Smaller numbers are further to the left on the line.' } },
        hints: ['On a number line, the further left, the smaller the number.', 'Look at your dots: which one is furthest left?', `${sn(small)} is furthest left, so it is the smallest.`],
        explain: `${sn(small)} is the smallest: it is furthest left. It is far from 0, but on the left side, so it is less than the others.`,
        solution: { board: solved(setup, { points: pts }), choice: correct },
      };
    }),
  T('estimate-the-point', 'Estimate the point', '3.NBT.A.1', '3',
    'The labels are hidden. A point sits a quarter, half or three quarters of the way along. What number is it at?',
    'Anchoring on halves and quarters is the estimation strategy. Refining after reveal teaches calibration.',
    R => {
      const L = R.pick([20, 40, 100, 200, 1000]), min = L * R.int(0, 3), q = R.int(1, 3), v = min + (q * L) / 4;
      const setup = lineBoard([{ min, max: min + L, step: L / 4, hide: true, points: [v], ask: true, q: true }]);
      return {
        prompt: `The labels are hidden. The line goes from ${fmt(min)} to ${fmt(min + L)}, with a tick every quarter of the way. What number is the point at?`, sig: `${min} ${L} ${q}`,
        setup, answer: { box: { key: String(v), label: 'the number' } },
        hints: [`Halfway between ${fmt(min)} and ${fmt(min + L)} is ${fmt(min + L / 2)}.`, `A quarter of the way is ${fmt(L / 4)} more than ${fmt(min)}.`, `The point is ${['', 'a quarter', 'halfway', 'three quarters'][q]} of the way: ${fmt(v)}.`],
        explain: `The point is at ${fmt(v)}: ${q} quarter${q === 1 ? '' : 's'} of ${fmt(L)} is ${fmt((q * L) / 4)}, and ${fmt(min)} + ${fmt((q * L) / 4)} = ${fmt(v)}.`,
        solution: { board: setup, box: String(v) },
      };
    }),
  T('difference-as-distance', 'Difference as distance', '7.NS.A.1c', '7',
    'Plot two numbers, one maybe below 0. Measure the gap between them.',
    'Both gaps are distances: 18 in each case. Subtraction as distance works across zero too.',
    R => {
      let a, b; do { a = R.chance(0.6) ? -R.int(1, 15) : R.int(1, 15); b = R.int(1, 25); } while (Math.abs(b - a) < 5 || a === b);
      const setup = lineBoard([{ min: -20, max: 30 }]), lo = Math.min(a, b), hi = Math.max(a, b);
      return {
        prompt: `Put dots at ${sn(a)} and ${sn(b)}. How far apart are they?`,
        setup, answer: { board: [{ t: 'points', at: [a, b], say: `Put dots at ${sn(a)} and ${sn(b)}.` }], box: { key: String(hi - lo), label: 'how far apart' } },
        hints: [lo < 0 ? `Count in two parts: from ${sn(lo)} up to 0, then up to ${hi}.` : `Count up from ${lo} to ${hi}.`, lo < 0 ? `${sn(lo)} to 0 is ${-lo}. 0 to ${hi} is ${hi}.` : `${hi} - ${lo} is the gap.`, `They are ${hi - lo} apart.`],
        explain: `The distance from ${sn(lo)} to ${hi} is ${hi} - ${lo < 0 ? `(${sn(lo)})` : lo} = ${hi - lo}. A difference is a distance on the line, across 0 too.`,
        solution: { board: solved(setup, { points: [a, b] }), box: String(hi - lo) },
      };
    }),
  T('halves-and-quarters', 'Halves and quarters', '3.NF.A.2b', '3',
    'On a 0 to 2 line with quarter intervals, plot four fractions. Which one sits on a whole number?',
    'Only the whole number points coincide; improper fractions sit beyond 1, which is the point of including 7/4.',
    R => {
      const whole = R.pick([4, 8]), others = R.shuffle([1, 2, 3, 5, 6, 7]).slice(0, 3), ks = R.shuffle([whole, ...others]);
      const name = k => (k % 2 === 0 && k !== whole && R.chance(0.5) ? fr(k, 4) : `${k}/4`), names = ks.map(name);
      const setup = lineBoard([{ min: 0, max: 2, step: 0.25, frac: true }]), correct = ks.indexOf(whole);
      return {
        prompt: `On the 0 to 2 line in fourths, put dots at ${list3(names)}. Which one is at a whole number?`,
        setup, answer: { board: [{ t: 'points', at: ks.map(k => k / 4), say: `Put dots at ${list3(names)}.` }], choice: { options: names, correct, say: 'Which dot sits on 1 or 2?' } },
        hints: ['Four fourths make 1 whole, and eight fourths make 2.', 'Look at your dots: which one sits on the 1 or the 2?', `${names[correct]} is the same as ${whole / 4}.`],
        explain: `${names[correct]} = ${whole / 4}, a whole number. The others sit between the whole numbers.`,
        solution: { board: solved(setup, { points: ks.map(k => k / 4) }), choice: correct },
      };
    }),
  T('inequality-line', 'Inequality line', '6.EE.B.8', '6',
    'Put a dot on every whole number greater than one number and less than another. Which test number belongs?',
    'Endpoints are excluded here, a subtle idea. Testing boundary values makes the convention discussable.',
    R => {
      const a = R.int(-8, 4), b = a + R.int(3, 6), inside = Array.from({ length: b - a - 1 }, (_, i) => a + 1 + i), m = R.pick(inside);
      const opts = R.shuffle([a, b, m]), correct = opts.indexOf(m), setup = lineBoard([{ min: -10, max: 10 }]);
      return {
        prompt: `Put a dot on every whole number greater than ${sn(a)} and less than ${sn(b)}. Which one of ${list3(opts.map(sn)).replace(' and ', ' or ')} belongs?`,
        setup, answer: { board: [{ t: 'points', at: inside, say: `Put dots on the whole numbers after ${sn(a)} and before ${sn(b)}, and no others.` }], choice: { options: opts.map(sn), correct, say: `${sn(a)} and ${sn(b)} themselves are not greater than ${sn(a)} and less than ${sn(b)}.` } },
        hints: [`Start just after ${sn(a)}: ${sn(a + 1)}. Stop just before ${sn(b)}.`, `${sn(a)} is not greater than itself, and ${sn(b)} is not less than itself.`, `The dots are ${list3(inside.map(sn))}. ${sn(m)} belongs.`],
        explain: `The numbers greater than ${sn(a)} and less than ${sn(b)} are ${list3(inside.map(sn))}. The two ends are left out, so only ${sn(m)} belongs.`,
        solution: { board: solved(setup, { points: inside }), choice: correct },
      };
    }),
  T('scale-the-line', 'Scale the line', '3.MD.B.4', '3',
    'Plot three numbers on a line whose step is more than 1. How many steps is the last one from 0?',
    'Interval choice is scale choice. Too small an interval crowds labels, too large loses precision.',
    R => {
      const step = R.pick([5, 10, 25, 50, 100]), n = R.pick([8, 10, 12]), max = step * n;
      const ks = R.shuffle(Array.from({ length: n - 1 }, (_, i) => i + 1)).slice(0, 3).sort((x, y) => x - y), pts = ks.map(k => k * step);
      const setup = lineBoard([{ min: 0, max, step }]);
      return {
        prompt: `The line goes from 0 to ${fmt(max)} in steps of ${step}. Put dots at ${list3(pts.map(fmt))}. How many steps is ${fmt(pts[2])} from 0?`,
        setup, answer: { board: [{ t: 'points', at: pts, say: `Put dots at ${list3(pts.map(fmt))}.` }], box: { key: String(ks[2]), label: 'steps' } },
        hints: [`Each step is ${step}. Count by ${step}s: ${countTo(ks[2], step)}.`, `${fmt(pts[2])} ÷ ${step} tells how many steps.`, `${fmt(pts[2])} is ${ks[2]} steps of ${step}: ${ks[2]} × ${step} = ${fmt(pts[2])}.`],
        explain: `${fmt(pts[2])} = ${ks[2]} × ${step}, so it is ${ks[2]} steps from 0. A step of ${step} fits ${fmt(max)} on one line with room to read every label.`,
        solution: { board: solved(setup, { points: pts }), box: String(ks[2]) },
      };
    }),
];
