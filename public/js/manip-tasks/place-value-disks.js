// Place Value Disks: the tool's 17 tasks as practice (docs/manip-practice-tasks.md). As in base-ten-blocks.js: each task
// keeps its title, code, grade and notes; make(R) gives one variation; conds are this tool's board checks, read from the
// board's disks (values by kind, manip-pv.js valueOf) and its place-value charts (manip-pv.js columnsOf / columnOf).
// Every variation hides the board's totals (a practice board: no total gives an answer away). Disks a student must
// only read (a chart to compare, a claim to check) are locked and laid out in their columns here (the page lays out
// only the unlocked ones).
import { boardWith, rowPlaces, objSizeOf, fmt, expandedText, plural } from '../manip-task-kit.js';
import { allPieceDefs } from '../manip-data.js';
import { slotsOf } from '../manip-board.js';
import { valueOf, columnsOf, columnOf, stepsApart, fitColumn, FIT } from '../manip-pv.js';

export const SLUG = 'place-value-disks';
const DEFS = Object.fromEntries(allPieceDefs(SLUG).map(d => [d.kind, d]));
/** Kinds from the biggest down, and each one's value in thousandths (whole numbers: no rounding trouble). */
const KINDS = ['m', 'hth', 'tth', 'th', 'h', 't', 'o', 'tenth', 'hund', 'thou'];
const MILLI = { m: 1e9, hth: 1e8, tth: 1e7, th: 1e6, h: 1e5, t: 1e4, o: 1e3, tenth: 100, hund: 10, thou: 1 };
const COL = { m: 'Millions', hth: 'Hundred thousands', tth: 'Ten thousands', th: 'Thousands', h: 'Hundreds', t: 'Tens', o: 'Ones', tenth: 'Tenths', hund: 'Hundredths', thou: 'Thousandths' };
const KIND_OF_COL = Object.fromEntries(Object.entries(COL).map(([k, c]) => [c, k]));
const C4 = ['Thousands', 'Hundreds', 'Tens', 'Ones'];
const C5 = ['Ten thousands', ...C4];
const C6 = ['Hundred thousands', ...C5];
const C3 = ['Hundreds', 'Tens', 'Ones'];
const D4 = ['Ones', 'Tenths', 'Hundredths', 'Thousandths'];
/** Kinds that ten of regroup into one disk of the next place (every disk but the million). */
const TEN_UP = KINDS.slice(1);

// ---------------------------------------------------------------- numbers and disks
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
/** A number's disks by place: { kind: count }, from its value in thousandths. */
export function hasOfMilli(t) {
  const out = {}; let r = Math.round(t);
  for (const k of KINDS) { const n = Math.floor(r / MILLI[k]); if (n) out[k] = n; r -= n * MILLI[k]; }
  return out;
}
export const hasOf = n => hasOfMilli(Math.round(n * 1000));
const milliOf = has => Object.entries(has).reduce((s, [k, n]) => s + MILLI[k] * n, 0);
/** "4 disks of 10,000, 2 disks of 100 and 6 disks of 1" */
function hasText(has) {
  const l = KINDS.filter(k => has[k]).map(k => `${has[k]} disk${has[k] === 1 ? '' : 's'} of ${DEFS[k].label}`);
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}` : l[0] || 'no disks';
}
/** A decimal from thousandths, as typed: 0.405, 34.5, 2. */
const dec = t => fmt(Math.round(t) / 1000);
const digitsOf = (n, len) => String(n).padStart(len, '0').split('').map(Number);

// ---------------------------------------------------------------- the board
let seq = 0;
/** A disk of a kind at (x, y), as the page makes one (manip.js mkPiece). */
const disk = (kind, x, y, locked = false) => { const d = DEFS[kind]; return { id: `d${(++seq).toString(36)}`, kind, x: Math.round(x), y: Math.round(y), rot: 0, flipped: false, filled: true, locked, color: d.color, label: d.label, value: d.value, w: d.w, h: d.h }; };
/** Disks for `has` in their columns of a chart object, laid out in tidy rows as the page lays out a column (manip-pv.js
 *  fitColumn: the page leaves locked disks where they are, so they are placed right here). */
function disksInChart(o, has, locked) {
  const out = [], slots = slotsOf(SLUG, o);
  o.st.cols.forEach((col, i) => {
    const kind = KIND_OF_COL[col], n = (kind && has[kind]) || 0, s = slots[i]; if (!n) return;
    const d = DEFS[kind], box = { x: s.x + FIT.pad, y: s.y + FIT.top + 10, w: s.w - 2 * FIT.pad, h: s.h - FIT.top - FIT.pad - 10 };   // (10 more at the top: a lock badge clear of the heading)
    const fit = fitColumn(box, Array.from({ length: n }, () => ({ w: d.w, h: d.h })), { gap: FIT.gap });
    fit.places.forEach(L => { const p = disk(kind, L.x, L.y, locked); p.x = L.x; p.y = L.y; p.w = L.w; p.h = L.h; if (L.w !== d.w) { p.nw = d.w; p.nh = d.h; } out.push(p); });
  });
  return out;
}
/** Disks for `has` in a tidy group from (x, y), at most `wide` across (biggest first; a new kind starts a new row). */
function disksAt(x0, y0, wide, has, locked) {
  const out = []; let x = x0, y = y0, rowH = 0;
  for (const kind of KINDS) {
    const n = has[kind] || 0; if (!n) continue;
    if (x > x0) { x = x0; y += rowH + 12; rowH = 0; }
    for (let j = 0; j < n; j++) {
      const d = DEFS[kind];
      if (x + d.w > x0 + wide) { x = x0; y += rowH + 8; rowH = 0; }
      out.push(disk(kind, x, y, locked)); x += d.w + 8; rowH = Math.max(rowH, d.h);
    }
  }
  return out;
}
/** A board: charts [{ cols, has, locked, label }] and mats [{ has, locked, label }] in one row, centered. */
export function diskBoard({ charts = [], mats = [] } = {}) {
  const objs = [
    ...charts.map((c, i) => ({ id: `c${i + 1}`, k: 'pv-chart', s: 1, st: { cols: c.cols || C4, ...(c.label ? { label: c.label } : {}) }, spec: c })),
    ...mats.map((m, i) => ({ id: `m${i + 1}`, k: 'mat', s: 1, st: { ...(m.label ? { label: m.label } : {}) }, spec: m })),
  ];
  const places = rowPlaces(objs.map(o => objSizeOf(SLUG, o.k, o.st)));
  const pieces = [];
  objs.forEach((o, i) => {
    o.x = places[i].x; o.y = places[i].y;
    if (o.spec.has) pieces.push(...(o.k === 'pv-chart' ? disksInChart(o, o.spec.has, !!o.spec.locked) : disksAt(o.x + 16, o.y + 46, 404, o.spec.has, !!o.spec.locked)));
    delete o.spec;
  });
  return boardWith(SLUG, objs, pieces);
}
/** The same board with the unlocked disks replaced by `has`, in chart `at` (or on the first mat): the solutions. */
function solved(setup, has, at = 0) {
  const b = JSON.parse(JSON.stringify(setup)), o = b.objects.filter(x => x.k === 'pv-chart')[at] || b.objects[0];
  b.pieces = [...b.pieces.filter(p => p.locked), ...(o.k === 'pv-chart' ? disksInChart(o, has, false) : disksAt(o.x + 16, o.y + 46, 404, has, false))];
  return b;
}

// ---------------------------------------------------------------- the checks
const piecesOf = b => ((b && Array.isArray(b.pieces)) ? b.pieces : []).filter(p => p && typeof p === 'object' && DEFS[p.kind]).map(p => ({ ...p, x: num(p.x), y: num(p.y), w: num(p.w, DEFS[p.kind].w), h: num(p.h, DEFS[p.kind].h) }));
const countOf = (ps, kind) => ps.filter(p => p.kind === kind).length;
export const conds = {
  /** The disks (unlocked ones, or all with all: true) total n. */
  total: (c, b) => { const ps = piecesOf(b).filter(p => c.all || !p.locked); return Math.abs(ps.reduce((s, p) => s + valueOf(SLUG, p), 0) - c.n) < 1e-6; },
  /** No ten disks of a kind that could regroup into one disk of the next place. */
  fewest: (c, b) => { const ps = piecesOf(b).filter(p => !p.locked); return TEN_UP.every(k => countOf(ps, k) < 10); },
  /** Exactly these many of each kind named (and none of any other kind). */
  counts: (c, b) => { const ps = piecesOf(b).filter(p => !p.locked); return KINDS.every(k => countOf(ps, k) === (c.has[k] || 0)); },
  /** Every disk sits in a place-value chart's column of its own place (a 10 disk in Tens). */
  inChart: (c, b) => {
    const ps = piecesOf(b).filter(p => !p.locked), cols = columnsOf(SLUG, { objects: (b.objects || []).filter(o => o && o.k === 'pv-chart' && o.st && Array.isArray(o.st.cols)) });
    return ps.length > 0 && ps.every(p => { const col = columnOf(cols, p); return !!col && stepsApart(valueOf(SLUG, p), col.place) === 0; });
  },
};

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
/** The usual "build it" checks: the total, the fewest disks, every disk in its column. */
const built = (n, what = fmt(n)) => [
  { t: 'total', n, say: `The disks should show ${what}.` },
  { t: 'fewest', say: 'Use the fewest disks: no ten of a kind.' },
  { t: 'inChart', say: 'Put every disk in its own column of the chart.' }];
const PLACE_WORD = { 10000: 'ten thousand', 1000: 'thousand', 100: 'hundred', 10: 'ten' };
export const TASKS = [
  T('build-40-206', 'Build a 5-digit number', '4.NBT.A.2', '4',
    'Build a five-digit number with a zero in it, using the fewest disks. Which place has no disk?',
    'The thousands and tens columns sit empty: the zeros hold those places. Disks make the placeholder zero visible because the column is there but has no disk.',
    R => {
      const d = [R.int(1, 6), R.int(1, 6), R.int(1, 6), R.int(1, 6), R.int(1, 6)], z = R.int(1, 4); d[z] = 0;
      const n = +d.join(''), setup = diskBoard({ charts: [{ cols: C5 }] }), squeezed = +d.filter((x, i) => i !== z).join('');
      return {
        prompt: `Build ${fmt(n)} in the place-value chart with the fewest disks. Which place has no disks?`,
        setup, answer: { board: built(n), choice: { options: C5, correct: z, say: 'Which column of the chart is empty?' } },
        hints: [`${fmt(n)} is ${hasText(hasOf(n))}.`, 'Put each disk in the column with its name. Then look for the column with no disks.', `The ${C5[z]} column is empty: the 0 in ${fmt(n)} holds that place.`],
        explain: `In ${fmt(n)} the 0 holds the ${C5[z].toLowerCase()} place. Without it the digits would read ${fmt(squeezed)}, a different number.`,
        solution: { board: solved(setup, hasOf(n)), choice: z },
      };
    }),
  T('ten-times-bigger', 'Ten times bigger', '5.NBT.A.2', '5',
    'Build ten times a number with the fewest disks: every disk moves one place to the left. What number do you have?',
    'Same disks, ten times the value. This is the multiplicative structure of place value, not just moving digits.',
    R => {
      const n = R.int(12, 899), m = 10 * n, setup = diskBoard({ charts: [{ cols: C4 }] });
      return {
        prompt: `${fmt(n)} is ${hasText(hasOf(n))}. Build ten times as much in the chart with the fewest disks: each disk becomes the disk one place to the left. What is 10 × ${fmt(n)}?`,
        setup, answer: { board: built(m, `10 × ${fmt(n)}`), box: { key: String(m), label: '10 times' } },
        hints: ['Ten disks of 1 make one disk of 10. So ten times a disk is the disk one place to the left.', `A disk of 1 becomes a disk of 10, a disk of 10 becomes a disk of 100, and so on: ${hasText(hasOf(m))}.`, `10 × ${fmt(n)} = ${fmt(m)}.`],
        explain: `10 × ${fmt(n)} = ${fmt(m)}. Every disk moved one place to the left, so every digit is worth ten times as much.`,
        solution: { board: solved(setup, hasOf(m)), box: String(m) },
      };
    }),
  T('break-to-subtract', 'Break to subtract', '3.NBT.A.2', '3',
    'The chart shows a two-digit number. Take away another number, breaking a ten disk when the ones run out. What is left?',
    'Breaking a disk into ten ones is borrowing with the mystery removed. Narrate each break before allowing the take-away.',
    R => {
      let a; do { a = R.int(31, 99); } while (a % 10 > 8);
      const bo = R.int(a % 10 + 1, 9), bt = R.int(1, Math.floor(a / 10) - 1), b = 10 * bt + bo, left = a - b;
      const setup = diskBoard({ charts: [{ cols: C3, has: hasOf(a) }] });
      return {
        prompt: `The chart shows ${a}. Take away ${b}. When there are not enough ones, hold a 10 disk and pick Break. What is left?`,
        setup, answer: { board: [{ t: 'total', n: left, say: `Take away disks worth ${b}, so the chart shows what is left.` }], box: { key: String(left), label: 'what is left' } },
        hints: [`You need to take away ${plural(bo, 'one')}, but there ${a % 10 === 1 ? 'is' : 'are'} only ${a % 10}. Hold a 10 disk and pick Break: it becomes ten disks of 1.`, `Now take away ${plural(bt, 'disk')} of 10 and ${plural(bo, 'disk')} of 1.`, `${a} - ${b} = ${left}.`],
        explain: `${a} - ${b} = ${left}. Breaking one ten into ten ones gives enough ones to take away, and the total stays the same until you do.`,
        solution: { board: solved(setup, hasOf(left)), box: String(left) },
      };
    }),
  T('decimal-disks-0-405', 'Decimal disks to thousandths', '5.NBT.A.3b', '5',
    'Build a decimal with tenth, hundredth and thousandth disks. Break one 0.1 disk: how many 0.01 disks are there now?',
    'Two zeros in one small number is a rich discussion: one is a placeholder, one shows an empty column. Ask which is which.',
    R => {
      const x = R.int(1, 9), y = R.int(0, 9), z = R.int(0, 9), t = 100 * x + 10 * y + z, want = { tenth: x - 1, hund: y + 10, thou: z };
      if (!want.tenth) delete want.tenth; if (!want.thou) delete want.thou;
      const setup = diskBoard({ charts: [{ cols: D4 }] });
      return {
        prompt: `Build ${dec(t)} in the chart with 0.1, 0.01 and 0.001 disks. Then hold a 0.1 disk and pick Break. How many 0.01 disks are there now?`,
        setup, answer: { board: [{ t: 'total', n: t / 1000, say: `The disks should still show ${dec(t)}.` }, { t: 'counts', has: want, say: 'Build the number, then break one 0.1 disk into ten 0.01 disks.' }], box: { key: String(y + 10), label: '0.01 disks' } },
        hints: [`${dec(t)} is ${hasText(hasOf(t / 1000))}.`, 'Hold a 0.1 disk and pick Break: it becomes ten 0.01 disks.', `${y} + 10 = ${y + 10} disks of 0.01, and the total is still ${dec(t)}.`],
        explain: `One tenth is ten hundredths, so ${dec(t)} is also ${plural(x - 1, 'tenth')}, ${y + 10} hundredths and ${plural(z, 'thousandth')}.`,
        solution: { board: solved(setup, want), box: String(y + 10) },
      };
    }),
  T('disk-race-to-a-million', 'Disk race to a million', '4.NBT.A.1', '4',
    'Start with some disks of one place. Add more until there are ten, then Regroup them into one disk. What is the new disk worth?',
    'One regroup at the end turns ten 100,000 disks into a million disk. Large numbers obey the same ten-for-one rule.',
    R => {
      const p = R.int(1, 5), k = R.int(1, 9), v = 10 ** p, kind = KINDS[6 - p], up = KINDS[5 - p];
      const setup = diskBoard({ mats: [{ has: { [kind]: k } }] });
      return {
        prompt: `There ${k === 1 ? 'is 1 disk' : `are ${k} disks`} of ${fmt(v)}. Add more ${fmt(v)} disks until there are ten. Then tap one and Regroup the ten into one disk. What is the new disk worth?`,
        setup, answer: { board: [{ t: 'counts', has: { [up]: 1 }, say: `Make ten disks of ${fmt(v)}, then Regroup them into one disk.` }], box: { key: String(10 * v), label: 'the new disk' } },
        hints: [`You need ${10 - k} more disk${10 - k === 1 ? '' : 's'} of ${fmt(v)} to make ten.`, 'Tap one of the ten disks, then tap Regroup 10 → 1.', `Ten disks of ${fmt(v)} make one disk of ${fmt(10 * v)}.`],
        explain: `10 × ${fmt(v)} = ${fmt(10 * v)}. Ten of any disk always make one disk of the next place, even for big numbers.`,
        solution: { board: solved(setup, { [up]: 1 }), box: String(10 * v) },
      };
    }),
  T('write-it-three-ways', 'Write it three ways', '4.NBT.A.2', '4',
    'Build a five-digit number with the fewest disks, then type it in expanded form.',
    'Expanded form mirrors disks one to one. Word form is where the empty thousands place most often gets dropped.',
    R => {
      const d = [R.int(1, 5), R.int(0, 5), R.int(0, 5), R.int(0, 5), R.int(0, 5)]; d[R.int(1, 4)] = 0;
      const n = +d.join(''), setup = diskBoard({ charts: [{ cols: C5 }] });
      return {
        prompt: `Build ${fmt(n)} in the chart with the fewest disks. Then type ${fmt(n)} in expanded form (like 30000 + 400 + 2).`,
        setup, answer: { board: built(n), box: { key: String(n), kind: 'expanded', label: 'expanded form', say: 'Write what each column is worth, with + between them.' } },
        hints: [`${fmt(n)} is ${hasText(hasOf(n))}.`, 'Expanded form adds what each column is worth: 3 disks of 1,000 are 3000.', `${fmt(n)} = ${expandedText(n)}.`],
        explain: `${fmt(n)} = ${expandedText(n)}. Each part is one column of disks, so expanded form matches the chart exactly.`,
        solution: { board: solved(setup, hasOf(n)), box: expandedText(n) },
      };
    }),
  T('divide-disks-by-10', 'Divide disks by 10', '5.NBT.A.2', '5',
    'Build a number divided by 10 with the fewest disks: every disk moves one place to the right. What number remains?',
    'Moving right divides by 10. Repeating the move shows repeated division and prepares for decimals.',
    R => {
      const n = R.int(101, 999), q = n / 10, setup = diskBoard({ charts: [{ cols: [...C3, 'Tenths'] }] });
      return {
        prompt: `${n} is ${hasText(hasOf(n))}. Build ${n} ÷ 10 in the chart with the fewest disks: each disk becomes the disk one place to the right. What is ${n} ÷ 10?`,
        setup, answer: { board: built(q, `${n} ÷ 10`), box: { key: String(q), label: 'divided by 10' } },
        hints: ['A disk of 100 split into ten is ten disks of 10. So a tenth of a disk is the disk one place to the right.', `A disk of 100 becomes a disk of 10, a disk of 10 becomes a disk of 1, a disk of 1 becomes a disk of 0.1: ${hasText(hasOf(q))}.`, `${n} ÷ 10 = ${fmt(q)}.`],
        explain: `${n} ÷ 10 = ${fmt(q)}. Every disk moved one place to the right, so every digit is worth a tenth as much.`,
        solution: { board: solved(setup, hasOf(q)), box: String(q) },
      };
    }),
  T('subtract-across-zeros', 'Subtract across zeros', '4.NBT.B.4', '4',
    'The chart shows some thousands. Take away a two-digit number, breaking disks step by step. What is left?',
    'The cascade 1000 to 999 is the classic hard case. Disks show every break, so the answer 999 is earned, not guessed.',
    R => {
      const c = R.int(1, 5), b = R.int(2, 99), a = 1000 * c, left = a - b, setup = diskBoard({ charts: [{ cols: C4, has: { th: c } }] });
      return {
        prompt: `The chart shows ${fmt(a)}. Take away ${b}. Hold a disk and pick Break, one place at a time, until you can take ${b} away. What is left?`,
        setup, answer: { board: [{ t: 'total', n: left, say: `Take away disks worth ${b}, so the chart shows what is left.` }], box: { key: String(left), label: 'what is left' } },
        hints: ['There are no hundreds, tens or ones yet. Break a 1,000 disk into ten disks of 100.', 'Then break a 100 disk into ten disks of 10, and a 10 disk into ten disks of 1.', `Now take away ${b}: ${fmt(a)} - ${b} = ${fmt(left)}.`],
        explain: `${fmt(a)} - ${b} = ${fmt(left)}. Each break trades one disk for ten of the next place, so the total stays ${fmt(a)} until you take away.`,
        solution: { board: solved(setup, hasOf(left)), box: String(left) },
      };
    }),
  T('decimal-compare', 'Decimal compare', '5.NBT.A.3b', '5',
    'Two decimals are built in two charts. Type the greater one, and pick the column that proves it.',
    'Tenths tie, hundredths decide. Children who say 0.72 is smaller because it has more digits need this exact comparison.',
    R => {
      const at = R.int(0, 2), d = [R.int(1, 8), R.int(0, 8), R.int(0, 8)], e = [...d];
      e[at] = R.int(d[at] + 1, 9);
      for (let i = at + 1; i < 3; i++) { d[i] = R.chance(0.4) ? 0 : R.int(0, 9); e[i] = R.chance(0.4) ? 0 : R.int(0, 9); }
      const A = 100 * d[0] + 10 * d[1] + d[2], B = 100 * e[0] + 10 * e[1] + e[2], flip = R.chance(), left = flip ? B : A, right = flip ? A : B, big = Math.max(A, B);
      const cols = ['Tenths', 'Hundredths', 'Thousandths'];
      const setup = diskBoard({ charts: [{ cols: D4, has: hasOfMilli(left), locked: true, label: 'A' }, { cols: D4, has: hasOfMilli(right), locked: true, label: 'B' }] });
      return {
        prompt: 'Chart A and chart B each show a decimal. Type the greater number, then pick the column that decides which is greater.', sig: `${left} ${right}`,
        setup, answer: { box: { key: dec(big), label: 'the greater number' }, choice: { options: cols, correct: at, say: 'Compare from the left: where are the disks first different?' } },
        hints: ['Read each chart: disks of 0.1 are tenths, 0.01 hundredths, 0.001 thousandths.', 'Compare column by column from the left. Skip the columns that match.', `${dec(left)} and ${dec(right)} first differ in the ${cols[at]} column, so ${dec(big)} is greater.`],
        explain: `${dec(big)} is greater. The columns to the left of ${cols[at]} match, so the ${cols[at]} column decides, however many digits each number has.`,
        solution: { board: setup, box: dec(big), choice: at },
      };
    }),
  T('multiply-disks', 'Multiply disks', '4.NBT.B.5', '4',
    'The chart shows a three-digit number. Make every column a few times as big, regroup where a column reaches ten, and type the product.',
    'Tripling disks is 213 x 3 with the algorithm made visible. Regrouping after tripling mirrors carrying.',
    R => {
      let n, k;
      do { n = 100 * R.int(1, 3) + 10 * R.int(0, 4) + R.int(0, 4); k = R.int(2, 4); } while (!((n % 10) * k >= 10 || (Math.floor(n / 10) % 10) * k >= 10) || n * k > 9999 || n % 100 === 0);
      const p = n * k, setup = diskBoard({ charts: [{ cols: C4, has: hasOf(n) }] });
      return {
        prompt: `The chart shows ${n}. Add disks so every column has ${k} times as many. Regroup any ten disks of a kind into one disk of the next place. What is ${n} × ${k}?`,
        setup, answer: { board: [{ t: 'total', n: p, say: `Make every column ${k} times as big: the disks should show ${n} × ${k}.` }, { t: 'fewest', say: 'Regroup any ten disks of a kind into one disk of the next place.' }], box: { key: String(p), label: 'the product' } },
        hints: [`${n} is ${hasText(hasOf(n))}. Add more until each column has ${k} times as many.`, 'Ten disks of 1 make a disk of 10: tap one, then tap Regroup 10 → 1. Do the same in every column with ten or more.', `${n} × ${k} = ${fmt(p)}.`],
        explain: `${n} × ${k} = ${fmt(p)}. Each column was multiplied by ${k}, and every ten disks moved one place to the left: that is carrying.`,
        solution: { board: solved(setup, hasOf(p)), box: String(p) },
      };
    }),
  T('smallest-and-largest', 'Smallest and largest', '4.NBT.A.2', '4',
    'With four digits, build the largest four-digit number. Then find the smallest one with the same digits. How far apart are they?',
    'Largest 7,530, smallest 3,057 because zero cannot lead. The difference needs a subtraction with breaks, good practice in context.',
    R => {
      const ds = R.shuffle([0, 1, 2, 3, 4, 5, 6, 7]).slice(0, R.chance(0.5) ? 4 : 3);
      if (ds.length === 3) ds.push(R.pick([1, 2, 3, 4, 5, 6, 7].filter(x => !ds.includes(x))));
      const down = [...ds].sort((a, b) => b - a), up = [...ds].sort((a, b) => a - b);
      if (up[0] === 0) { const i = up.findIndex(x => x > 0); [up[0], up[i]] = [up[i], up[0]]; }
      const big = +down.join(''), small = +up.join(''), diff = big - small, setup = diskBoard({ charts: [{ cols: C4 }] });
      const list = `${ds.slice(0, 3).join(', ')} and ${ds[3]}`;
      return {
        prompt: `Use the digits ${list}, each once. Build the largest four-digit number in the chart. Then think of the smallest four-digit number with the same digits. How far apart are they?`,
        setup, answer: { board: built(big, 'the largest number'), box: { key: String(diff), label: 'how far apart' } },
        hints: ['The largest number puts the biggest digit in the thousands, then the next biggest, and so on.', `The largest is ${fmt(big)}. The smallest puts the smallest digit first, but a number can't start with 0: ${fmt(small)}.`, `${fmt(big)} - ${fmt(small)} = ${fmt(diff)}.`],
        explain: `The largest is ${fmt(big)} and the smallest is ${fmt(small)}, so they are ${fmt(diff)} apart. The same digits make very different numbers in different places.`,
        solution: { board: solved(setup, hasOf(big)), box: String(diff) },
      };
    }),
  T('thousandths-build', 'Thousandths build', '5.NBT.B.7', '5',
    'Build a number of thousandths, add some more 0.001 disks and regroup ten of them into a 0.01 disk. What number do you have?',
    'Adding seven thousandths fills the hundredths place after regrouping: 0.070. Small disks, same regrouping rule.',
    R => {
      const a = R.int(1, 8), b = R.int(1, 9), k = R.int(10 - b, 9), t0 = 10 * a + b, t = t0 + k, setup = diskBoard({ charts: [{ cols: D4 }] });
      return {
        prompt: `Build ${dec(t0)} in the chart. Then add ${k} more 0.001 disks and Regroup ten of them into one 0.01 disk. What number do the disks show now?`,
        setup, answer: { board: built(t / 1000, `${dec(t0)} + ${dec(k)}`), box: { key: dec(t), label: 'the number' } },
        hints: [`${dec(t0)} is ${a} disk${a === 1 ? '' : 's'} of 0.01 and ${b} disk${b === 1 ? '' : 's'} of 0.001.`, `${b} + ${k} = ${b + k} disks of 0.001. Tap one, then tap Regroup 10 → 1 to make ten of them one 0.01 disk.`, `${dec(t0)} + ${dec(k)} = ${dec(t)}.`],
        explain: `${dec(t0)} + ${dec(k)} = ${dec(t)}. Ten thousandths make one hundredth, the same ten-for-one rule as ones and tens.`,
        solution: { board: solved(setup, hasOfMilli(t)), box: dec(t) },
      };
    }),
  T('population-talk', 'Population talk', '4.NBT.B.4', '4',
    'A town\'s population is built in the chart. Show with disks what happens when more people arrive, and type the new population.',
    'Adding a ten-thousand disk changes one column only. Place value keeps big real numbers manageable.',
    R => {
      const p = R.pick([2, 3, 4]), c = R.int(1, 3), d = digitsOf(R.int(10000, 89999), 5);
      if (d[4 - p] + c > 9) d[4 - p] = R.int(0, 9 - c);
      const n = +d.join(''), add = c * 10 ** p, m = n + add, setup = diskBoard({ charts: [{ cols: C5, has: hasOf(n) }] });
      return {
        prompt: `A town has ${fmt(n)} people: the chart shows it. Then ${fmt(add)} more people move in. Add disks to show them. How many people live in the town now?`,
        setup, answer: { board: built(m), box: { key: String(m), label: 'people now' } },
        hints: [`${fmt(add)} is ${hasText(hasOf(add))}.`, `Add ${c} disk${c === 1 ? '' : 's'} of ${fmt(10 ** p)} to the ${COL[KINDS[6 - p]]} column. The other columns stay the same.`, `${fmt(n)} + ${fmt(add)} = ${fmt(m)}.`],
        explain: `${fmt(n)} + ${fmt(add)} = ${fmt(m)}. Only the ${COL[KINDS[6 - p]].toLowerCase()} column changed, so only one digit changed.`,
        solution: { board: solved(setup, hasOf(m)), box: String(m) },
      };
    }),
  T('disk-fractions-link', 'Disk fractions link', '5.NBT.A.3a', '5',
    'Break a 0.1 disk into ten 0.01 disks: the value stays the same. Which decimal is equal to the number shown?',
    'Trailing zeros add empty-value disks pairs that regroup to the same amount. Equality of decimals becomes visible.',
    R => {
      const x = R.int(1, 9), y = R.chance(0.3) ? 0 : R.int(1, 9), t = 100 * x + 10 * y, want = { tenth: x - 1, hund: y + 10 };
      if (!want.tenth) delete want.tenth;
      const shown = dec(t), opts = y ? [`0.${x}${y}0`, `0.${x}0${y}`, `0.0${x}${y}`] : [`0.${x}0`, `0.0${x}`, `0.00${x}`];
      const order = R.shuffle([0, 1, 2]), options = order.map(i => opts[i]), correct = order.indexOf(0);
      const setup = diskBoard({ charts: [{ cols: D4, has: hasOfMilli(t) }] });
      return {
        prompt: `The chart shows ${shown}. Hold a 0.1 disk and pick Break: it becomes ten 0.01 disks, and the value stays the same. Which number is equal to ${shown}?`,
        setup, answer: { board: [{ t: 'counts', has: want, say: 'Break one 0.1 disk into ten 0.01 disks.' }], choice: { options, correct, say: 'Which number keeps every digit in the same place?' } },
        hints: ['Hold a 0.1 disk and pick Break. Now count the disks in each column.', `The tenths and hundredths stay the same; a 0 at the end adds no disks at all.`, `${opts[0]} has the same digits in the same places as ${shown}, so it is equal.`],
        explain: `${shown} = ${opts[0]}: a 0 at the end of a decimal adds no value. Moving a digit to the right, like ${opts[1]}, changes the number.`,
        solution: { board: solved(setup, want), choice: correct },
      };
    }),
  T('round-the-disks', 'Round the disks', '4.NBT.A.3', '4',
    'A five-digit number is built in the chart. Round it by looking at the disks, and pick the column whose disks decide.',
    'The hundreds disk decides: 8 hundreds rounds the thousands up to 77,000. The deciding disk should be pointed to.',
    R => {
      const P = R.pick([10000, 1000, 100]); let n;
      do { n = R.int(10000, 99989); } while (n % P === 0 || Math.floor(n / (P / 10)) % 10 === 5 || n > 94999);
      const r = Math.round(n / P) * P, at = C5.indexOf(COL[KINDS[7 - Math.log10(P)]]), setup = diskBoard({ charts: [{ cols: C5, has: hasOf(n), locked: true }] });
      const lo = Math.floor(n / P) * P;
      return {
        prompt: `The chart shows ${fmt(n)}. Round it to the nearest ${PLACE_WORD[P]}. Type the rounded number, then pick the column whose disks decide.`,
        setup, answer: { box: { key: String(r), label: 'rounded' }, choice: { options: C5, correct: at, say: 'Look one place to the right of the place you round to.' } },
        hints: [`${fmt(n)} is between ${fmt(lo)} and ${fmt(lo + P)}.`, `Look at the ${C5[at]} column, one place to the right: 5 or more disks there rounds up.`, `There ${Math.floor(n / (P / 10)) % 10 === 1 ? 'is 1 disk' : `are ${Math.floor(n / (P / 10)) % 10} disks`} in ${C5[at]}, so ${fmt(n)} rounds to ${fmt(r)}.`],
        explain: `${fmt(n)} rounds to ${fmt(r)}. The ${C5[at].toLowerCase()} column decides: it shows whether the number is past the halfway point.`,
        solution: { board: setup, box: String(r), choice: at },
      };
    }),
  T('break-in-two-ways', 'Break in two ways', '3.NBT.A.2', '3',
    'Build a two-digit number with tens and ones, then Break a ten to show it a second way. How many ones are there now?',
    'Flexible breaking is the heart of mental subtraction. Both forms must be read aloud to prove they equal 34.',
    R => {
      const tens = R.int(2, 9), ones = R.int(0, 9), n = 10 * tens + ones, want = { t: tens - 1, o: ones + 10 };
      const setup = diskBoard({ charts: [{ cols: C3 }] });
      return {
        prompt: `Build ${n} as ${plural(tens, 'disk')} of 10 and ${plural(ones, 'disk')} of 1. Then hold a 10 disk and pick Break to show ${n} a second way. How many disks of 1 are there now?`,
        setup, answer: { board: [{ t: 'total', n, say: `The disks should still show ${n}.` }, { t: 'counts', has: want, say: 'Build the number, then break one 10 disk into ten disks of 1.' }], box: { key: String(ones + 10), label: 'disks of 1' } },
        hints: [`Put ${plural(tens, 'disk')} of 10 in Tens and ${plural(ones, 'disk')} of 1 in Ones.`, 'Hold a 10 disk and pick Break: it becomes ten disks of 1.', `${ones} + 10 = ${ones + 10}. So ${n} is ${plural(tens - 1, 'ten')} and ${ones + 10} ones.`],
        explain: `${plural(tens, 'ten')} and ${plural(ones, 'one')}, or ${plural(tens - 1, 'ten')} and ${ones + 10} ones: both are ${n}. Breaking changes how it looks, not how much it is.`,
        solution: { board: solved(setup, want), box: String(ones + 10) },
      };
    }),
  T('missing-disk-mystery', 'Missing disk mystery', '4.NBT.A.2', '4',
    'Disks are built in a chart and someone makes a claim about the number. Type the number the disks show and say if the claim is right.',
    'The build is 500,024 only if the other places are truly empty. Checking claims against disks builds verification habits.',
    R => {
      const d = [R.int(1, 9), R.int(1, 5), R.int(1, 5), R.int(1, 5), R.int(1, 5), R.int(1, 5)];
      const zs = R.shuffle([1, 2, 3, 4]).slice(0, R.int(2, 3)); for (const z of zs) d[z] = 0;
      const n = +d.join(''), right = R.chance(0.45);
      const claim = right ? n : +d.filter((x, i) => i !== zs[0]).join('');
      const setup = diskBoard({ charts: [{ cols: C6, has: hasOf(n), locked: true }] });
      const options = ['Yes, the claim is right', 'No, the claim is not right'], correct = right ? 0 : 1;
      return {
        prompt: `Someone says these disks show ${fmt(claim)}. Type the number the disks show. Then pick if the claim is right.`,
        setup, answer: { box: { key: String(n), label: 'the number' }, choice: { options, correct, say: 'Compare your number with the claim, place by place.' } },
        hints: ['Read the chart from the left. An empty column is a 0 in the number.', `The disks show ${hasText(hasOf(n))}.`, `That is ${fmt(n)}, so the claim of ${fmt(claim)} is ${right ? 'right' : 'not right'}.`],
        explain: right ? `The disks show ${fmt(n)}, so the claim is right. Every empty column is a 0 that holds its place.` : `The disks show ${fmt(n)}, not ${fmt(claim)}. The claim left out a 0, so the digits slid into the wrong places.`,
        solution: { board: setup, box: String(n), choice: correct },
      };
    }),
];
export { C4, C5, C6, D4, COL, KINDS, milliOf };
