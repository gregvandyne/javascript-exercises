// Base Ten Blocks: the tool's 17 tasks as practice (docs/manip-practice-tasks.md). As in rekenreks.js: each task keeps
// its title, code, grade and notes; make(R) gives one variation; conds are this tool's board checks, read from the
// board's pieces (values by kind, manip-pv.js valueOf) and its place-value charts (manip-pv.js columnsOf / columnOf).
// Every variation hides the board's totals (a practice board: no total gives an answer away).
import { boardWith, rowPlaces, objSizeOf, fmt, expandedText, plural } from '../manip-task-kit.js';
import { allPieceDefs } from '../manip-data.js';
import { slotsOf } from '../manip-board.js';
import { valueOf, columnsOf, columnOf, stepsApart } from '../manip-pv.js';

export const SLUG = 'base-ten-blocks';
const WHOLE = ['Thousands', 'Hundreds', 'Tens', 'Ones'];
const DEC = ['Ones', 'Tenths', 'Hundredths'];
const DEFS = Object.fromEntries(allPieceDefs(SLUG).map(d => [d.kind, d]));
const PLACE_KIND = { Thousands: 'cube', Hundreds: 'flat', Tens: 'rod', Ones: 'unit' };
const DEC_KIND = { Ones: 'one', Tenths: 'tenth', Hundredths: 'hundredth' };
/** Kinds that ten of can regroup into one bigger block (the fewest-blocks rule). */
const TEN_UP = ['unit', 'rod', 'flat', 'tenth', 'hundredth', 'thousandth'];
const NAME = { cube: 'cube', flat: 'flat', rod: 'rod', unit: 'unit', one: 'one', tenth: 'tenth', hundredth: 'hundredth' };

// ---------------------------------------------------------------- the board
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
let seq = 0;
/** A block of a kind at (x, y), as the page makes one (manip.js mkPiece). */
const block = (kind, x, y, locked = false) => { const d = DEFS[kind]; return { id: `p${(++seq).toString(36)}`, kind, x: Math.round(x), y: Math.round(y), rot: 0, flipped: false, filled: true, locked, color: d.color, label: d.label, value: d.value, w: d.w, h: d.h }; };
/** The digits of a whole number by place: { cube, flat, rod, unit }. */
export const hasOf = n => ({ cube: Math.floor(n / 1000), flat: Math.floor(n / 100) % 10, rod: Math.floor(n / 10) % 10, unit: n % 10 });
/** A decimal (hundredths, as a whole number of them) by place: { one, tenth, hundredth }. */
export const decHasOf = h => ({ one: Math.floor(h / 100), tenth: Math.floor(h / 10) % 10, hundredth: h % 10 });
const dec = h => (h / 100).toFixed(2);
/** Blocks for `has` placed in their columns of a chart object (each at its column's middle: the page lays them out). */
function blocksInChart(o, has, locked) {
  const out = [], slots = slotsOf(SLUG, o);
  o.st.cols.forEach((col, i) => {
    const kind = (o.st.cols === DEC || o.st.cols.includes('Tenths') ? DEC_KIND : PLACE_KIND)[col], n = (kind && has[kind]) || 0, s = slots[i], d = kind && DEFS[kind];
    for (let j = 0; j < n; j++) out.push(block(kind, s.x + s.w / 2 - d.w / 2, s.y + s.h / 2 - d.h / 2, locked));
  });
  return out;
}
/** Blocks for `has` in a tidy group from (x, y), at most `wide` across (biggest first, rows left to right; a new kind
 *  starts a new row). */
function blocksAt(x0, y0, wide, has, locked) {
  const out = []; let x = x0, y = y0, rowH = 0;
  for (const kind of ['cube', 'flat', 'rod', 'unit', 'one', 'tenth', 'hundredth']) {
    const n = has[kind] || 0; if (!n) continue;
    if (x > x0) { x = x0; y += rowH + 14; rowH = 0; }
    for (let j = 0; j < n; j++) {
      const d = DEFS[kind];
      if (x + d.w > x0 + wide) { x = x0; y += rowH + 8; rowH = 0; }
      out.push(block(kind, x, y, locked)); x += d.w + 8; rowH = Math.max(rowH, d.h);
    }
  }
  return out;
}
const blocksOnMat = (o, has, locked) => blocksAt(o.x + 16, o.y + 46, 404, has, locked);
/**
 * A board: charts [{ cols, has, locked, label }] and mats [{ has, locked, label }] in one row, centered; loose: blocks
 * on the board itself ({ has, locked }: a group about 900 wide in the middle); decimal: the palette's decimal blocks.
 */
export function tenBoard({ charts = [], mats = [], loose = null, decimal = false } = {}) {
  const objs = [
    ...charts.map((c, i) => ({ id: `c${i + 1}`, k: 'pv-chart', s: 1, st: { cols: c.cols || WHOLE, ...(c.label ? { label: c.label } : {}) }, spec: c })),
    ...mats.map((m, i) => ({ id: `m${i + 1}`, k: 'mat', s: 1, st: { ...(m.label ? { label: m.label } : {}) }, spec: m })),
  ];
  const places = rowPlaces(objs.map(o => objSizeOf(SLUG, o.k, o.st)));
  const pieces = [];
  objs.forEach((o, i) => {
    o.x = places[i].x; o.y = places[i].y;
    if (o.spec.has) pieces.push(...(o.k === 'pv-chart' ? blocksInChart(o, o.spec.has, !!o.spec.locked) : blocksOnMat(o, o.spec.has, !!o.spec.locked)));
    delete o.spec;
  });
  if (loose) pieces.push(...blocksAt(1550, 900, 900, loose.has, !!loose.locked));
  return boardWith(SLUG, objs, pieces, { decimal });
}
/** The same board with the unlocked blocks replaced by `has`, in chart `at` (the solutions). */
function solved(setup, has, at = 0) {
  const b = JSON.parse(JSON.stringify(setup)), o = b.objects.filter(x => x.k === 'pv-chart')[at] || b.objects[0];
  b.pieces = [...b.pieces.filter(p => p.locked), ...(o.k === 'pv-chart' ? blocksInChart(o, has, false) : blocksOnMat(o, has, false))];
  return b;
}

// ---------------------------------------------------------------- the checks
const piecesOf = b => ((b && Array.isArray(b.pieces)) ? b.pieces : []).filter(p => p && typeof p === 'object' && DEFS[p.kind]).map(p => ({ ...p, x: num(p.x), y: num(p.y), w: num(p.w, DEFS[p.kind].w), h: num(p.h, DEFS[p.kind].h) }));
const countOf = (ps, kind) => ps.filter(p => p.kind === kind).length;
export const totalOf = b => Math.round(piecesOf(b).reduce((s, p) => s + valueOf(SLUG, p), 0) * 1e6) / 1e6;
export const conds = {
  /** The blocks (unlocked ones, or all with all: true) total n. */
  total: (c, b) => { const ps = piecesOf(b).filter(p => c.all || !p.locked); return Math.abs(ps.reduce((s, p) => s + valueOf(SLUG, p), 0) - c.n) < 1e-6; },
  /** No ten blocks of a kind that could regroup into one bigger block. */
  fewest: (c, b) => { const ps = piecesOf(b).filter(p => !p.locked); return TEN_UP.every(k => countOf(ps, k) < 10); },
  /** Exactly these many of each kind named (and none of any other kind). */
  counts: (c, b) => { const ps = piecesOf(b).filter(p => !p.locked); return Object.keys(DEFS).every(k => countOf(ps, k) === (c.has[k] || 0)); },
  /** Every block sits in a place-value chart's column of its own place (a rod in Tens). */
  inChart: (c, b) => {
    const ps = piecesOf(b).filter(p => !p.locked), cols = columnsOf(SLUG, { objects: (b.objects || []).filter(o => o && o.k === 'pv-chart' && o.st && Array.isArray(o.st.cols)) });
    return ps.length > 0 && ps.every(p => { const col = columnOf(cols, p); return !!col && stepsApart(valueOf(SLUG, p), col.place) === 0; });
  },
};
const hasText = has => Object.entries(has).filter(([, n]) => n).map(([k, n]) => `${n} ${NAME[k]}${n === 1 ? '' : 's'}`).join(', ');

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ totals: false, ...make(R) }) });
export const TASKS = [
  T('build-1-139', 'Build a 4-digit number', '2.NBT.A.1', '2',
    'Build a number in the place-value chart, then Break one hundreds flat into ten rods. The total does not change.',
    'Breaking conserves the total: that is the regrouping idea. Have children read the new form aloud (10 hundreds becomes 9 hundreds and 10 rods).',
    R => {
      const h = R.int(1, 9), t = R.int(0, 9), o = R.int(0, 9), n = 1000 + 100 * h + 10 * t + o;
      const want = { cube: 1, flat: h - 1, rod: t + 10, unit: o }, setup = tenBoard({ charts: [{}] });
      return {
        prompt: `Build ${fmt(n)} in the place-value chart. Then hold one hundreds flat and pick Break. The total stays ${fmt(n)}.`,
        setup, answer: { board: [
          { t: 'total', n, say: `The blocks should still show ${fmt(n)} in all.` },
          { t: 'inChart', say: 'Put every block in its own column of the chart.' },
          { t: 'counts', has: want, say: 'Break one flat into ten rods.' }] },
        hints: [`${fmt(n)} is ${hasText(hasOf(n))}. Put each block in its column.`, 'Hold a flat in Hundreds, then pick Break: it becomes ten rods in Tens.', `Now you have ${hasText(want)}. Still ${fmt(n)}!`],
        explain: `${fmt(n)} is 1 thousand, ${plural(h, 'hundred')}, ${plural(t, 'ten')} and ${plural(o, 'one')}. One hundred is ten tens, so after the break it is ${plural(h - 1, 'hundred')} and ${t + 10} tens: the same number.`,
        solution: { board: solved(setup, want) },
      };
    }),
  T('regroup-to-a-cube', 'Regroup to a cube', '3.NBT.A.2', '3',
    'Regroup ten flats into one 1,000 cube. How many units is the cube worth, and what is the total now?',
    'Ten of any piece makes one of the next. Repeat the chant at every size so the base-ten pattern is the takeaway, not the cube.',
    R => {
      const f = R.int(10, 19), r = R.int(0, 9), u = R.int(0, 9), n = 100 * f + 10 * r + u;
      const setup = tenBoard({ charts: [{ has: { flat: f, rod: r, unit: u } }] }), want = { cube: 1, flat: f - 10, rod: r, unit: u };
      return {
        prompt: `The chart has ${f} flats, ${plural(r, 'rod')} and ${plural(u, 'unit')}. Tap a flat, then tap Regroup 10 → 1 to make ten flats into one 1,000 cube. What number do the blocks show?`,
        setup, answer: { board: [{ t: 'counts', has: want, say: 'Regroup ten flats into one cube.' }], box: { key: String(n), label: 'the number' } },
        hints: ['Tap one flat in the Hundreds column, then tap Regroup 10 → 1 in the palette.', `Ten flats are 10 hundreds: 1,000. Now count: 1 cube, ${plural(f - 10, 'flat')}, ${plural(r, 'rod')}, ${plural(u, 'unit')}.`, `1,000 + ${(f - 10) * 100} + ${r * 10} + ${u} = ${fmt(n)}.`],
        explain: `Ten flats make one cube worth 1,000 units. The total stays ${fmt(n)}: regrouping never changes the number.`,
        solution: { board: solved(setup, want), box: String(n) },
      };
    }),
  T('346-278-with-blocks', 'Add 3-digit numbers with blocks', '2.NBT.B.7', '2',
    'Add two numbers with blocks. Regroup whenever a column reaches ten, then type the sum.',
    'Insist the written algorithm step happens at the same moment as the physical regroup, so the carrying digit has a meaning.',
    R => {
      let a, b;
      do { a = R.int(120, 699); b = R.int(110, 399); } while (a + b > 999 || ((a % 10) + (b % 10) < 10 && (Math.floor(a / 10) % 10) + (Math.floor(b / 10) % 10) < 10));
      const s = a + b, setup = tenBoard({ charts: [{ has: hasOf(a) }] });
      return {
        prompt: `The chart shows ${a}. Add ${b} with blocks. Whenever you have ten of a kind, Regroup them into one bigger block. What is ${a} + ${b}?`,
        setup, answer: { board: [{ t: 'total', n: s, say: `Add blocks for ${b}.` }, { t: 'fewest', say: 'Regroup any ten of a kind into one bigger block.' }], box: { key: String(s), label: 'the sum' } },
        hints: [`Add ${hasText(hasOf(b))} for ${b}.`, 'Ten units make a rod, ten rods make a flat: tap one, then Regroup 10 → 1.', `${a} + ${b} = ${s}: ${hasText(hasOf(s))}.`],
        explain: `${a} + ${b} = ${s}. Each time a column reached ten, ten blocks became one block in the next column: that is the "carry".`,
        solution: { board: solved(setup, hasOf(s)), box: String(s) },
      };
    }),
  T('decimal-build-2-35', 'Build a decimal', '5.NBT.A.3', '5',
    'In decimals, build a number with ones, tenths and hundredths. Break a tenth and say what the total is made of now.',
    'The flat is now worth 1, so every piece shrinks by a factor of 100. Naming the new unit before building prevents the classic decimal confusion.',
    R => {
      const x = R.int(1, 4), y = R.int(1, 9), z = R.int(0, 9), h = 100 * x + 10 * y + z, want = { one: x, tenth: y - 1, hundredth: z + 10 };
      const setup = tenBoard({ charts: [{ cols: DEC }], decimal: true });
      return {
        prompt: `Build ${dec(h)} in the chart with ones, tenths and hundredths. Then hold a tenth and pick Break. How many hundredths are there now?`,
        setup, answer: { board: [{ t: 'total', n: h / 100, say: `The blocks should show ${dec(h)}.` }, { t: 'counts', has: want, say: 'Break one tenth into ten hundredths.' }], box: { key: String(z + 10), label: 'hundredths' } },
        hints: [`${dec(h)} is ${plural(x, 'one')}, ${plural(y, 'tenth')} and ${plural(z, 'hundredth')}.`, 'Hold a tenth and pick Break: it becomes ten hundredths.', `${z} + 10 = ${z + 10} hundredths, and the total is still ${dec(h)}.`],
        explain: `One tenth is ten hundredths, so ${dec(h)} is also ${plural(x, 'one')}, ${plural(y - 1, 'tenth')} and ${z + 10} hundredths.`,
        solution: { board: solved(setup, want), box: String(z + 10) },
      };
    }),
  T('build-and-read-2-048', 'Build and read a 4-digit number', '4.NBT.A.2', '4',
    'Build a four-digit number with the fewest blocks, then type it in expanded form.',
    'Expanded form should mirror the blocks: 2000 + 40 + 8, with an empty hundreds place that still needs its zero in standard form.',
    R => {
      const d = [R.int(1, 9), R.int(1, 9), R.int(1, 9), R.int(1, 9)]; d[R.int(1, 3)] = 0;
      const n = d[0] * 1000 + d[1] * 100 + d[2] * 10 + d[3], setup = tenBoard({ charts: [{}] });
      return {
        prompt: `Build ${fmt(n)} in the place-value chart with the fewest blocks. Then type ${fmt(n)} in expanded form (like 3000 + 400 + 5).`,
        setup, answer: { board: [{ t: 'total', n, say: `The blocks should show ${fmt(n)}.` }, { t: 'fewest', say: 'Use the fewest blocks: no ten of a kind.' }, { t: 'inChart', say: 'Put every block in its own column of the chart.' }],
          box: { key: String(n), kind: 'expanded', label: 'expanded form', say: 'Write each column\'s value with + between them.' } },
        hints: [`${fmt(n)}: ${hasText(hasOf(n))}.`, 'Expanded form adds what each column is worth: cubes are thousands, flats hundreds, rods tens.', `${fmt(n)} = ${expandedText(n)}.`],
        explain: `${fmt(n)} = ${expandedText(n)}. A column with no blocks has nothing to add, but it still needs its 0 when you write ${fmt(n)}.`,
        solution: { board: solved(setup, hasOf(n)), box: expandedText(n) },
      };
    }),
  T('add-with-one-regroup', 'Add with one regroup', '2.NBT.B.7', '2',
    'Add a two-digit number to a three-digit number, regrouping once. Which column forced the regroup?',
    'Only the ones column overflows here. Naming the column that regroups focuses attention on why carrying happens.',
    R => {
      const which = R.int(0, 1); let a, b;
      do { a = R.int(101, 399); b = R.int(11, 99); } while (which === 0 ? !((a % 10) + (b % 10) >= 10 && (Math.floor(a / 10) % 10) + (Math.floor(b / 10) % 10) + 1 < 10) : !((a % 10) + (b % 10) < 10 && (Math.floor(a / 10) % 10) + (Math.floor(b / 10) % 10) >= 10));
      const s = a + b, setup = tenBoard({ charts: [{ has: hasOf(a) }] }), cols = ['Ones', 'Tens', 'Hundreds'];
      return {
        prompt: `The chart shows ${a}. Add ${b} and regroup once so you have the fewest blocks. Which column made you regroup?`,
        setup, answer: { board: [{ t: 'total', n: s, say: `Add blocks for ${b}.` }, { t: 'fewest', say: 'Regroup the ten of a kind into one bigger block.' }],
          choice: { options: cols, correct: which, say: 'Which kind of block reached ten?' } },
        hints: [`Add ${hasText(hasOf(b))}.`, which === 0 ? `Units: ${a % 10} + ${b % 10} is ten or more.` : `Rods: ${Math.floor(a / 10) % 10} + ${Math.floor(b / 10) % 10} is ten or more.`, `Regroup ten ${which === 0 ? 'units into a rod' : 'rods into a flat'}. The ${cols[which]} column made you regroup. ${a} + ${b} = ${s}.`],
        explain: `${a} + ${b} = ${s}. The ${cols[which]} column reached ten, so ten ${which === 0 ? 'units became one rod' : 'rods became one flat'}.`,
        solution: { board: solved(setup, hasOf(s)), choice: which },
      };
    }),
  T('subtract-with-breaking', 'Subtract with breaking', '3.NBT.A.2', '3',
    'Take away a two-digit number from a number with a zero in the tens. Break blocks as needed.',
    'Two breaks are needed, which is why zeros in subtraction cause trouble. Each break should be narrated before taking away.',
    R => {
      const h = R.int(2, 9), o = R.int(0, 5), a = 100 * h + o;
      const bo = R.int(o + 1, 9), bt = R.int(1, 9), b = 10 * bt + bo, left = a - b;
      const setup = tenBoard({ charts: [{ has: hasOf(a) }] });
      return {
        prompt: `The chart shows ${a}. Take away ${b}. Break a flat or a rod when you need more. What is left?`,
        setup, answer: { board: [{ t: 'total', n: left, say: `Take away blocks worth ${b}.` }], box: { key: String(left), label: 'what is left' } },
        hints: [`You need ${plural(bo, 'unit')} but there ${o === 1 ? 'is' : 'are'} only ${o}. There are no rods, so break a flat into ten rods first.`, 'Then break a rod into ten units. Now take away the rods and units.', `${a} - ${b} = ${left}.`],
        explain: `${a} - ${b} = ${left}. With no tens, you break a hundred into ten tens, then a ten into ten ones, before taking away.`,
        solution: { board: solved(setup, hasOf(left)), box: String(left) },
      };
    }),
  T('multiply-by-10', 'Multiply by 10', '5.NBT.A.2', '5',
    'Build ten times a number with the fewest blocks. What changes in every column?',
    'Every piece moves one place larger. This is the place value effect of multiplying by 10, not just adding a zero.',
    R => {
      const n = R.int(11, 99), m = 10 * n, setup = tenBoard({ charts: [{}] }), has = hasOf(n);
      return {
        prompt: `${n} is ${hasText(has)}. Build ten times as much with the fewest blocks: each block becomes the next bigger block. What is 10 × ${n}?`,
        setup, answer: { board: [{ t: 'total', n: m, say: `Build 10 × ${n} with blocks.` }, { t: 'fewest', say: 'Use the fewest blocks: no ten of a kind.' }], box: { key: String(m), label: '10 times' } },
        hints: ['Ten units are a rod, ten rods are a flat: ten times a block is the next block up.', `So ${plural(has.rod, 'rod')} ${has.rod === 1 ? 'becomes' : 'become'} ${plural(has.rod, 'flat')} and ${plural(has.unit, 'unit')} ${has.unit === 1 ? 'becomes' : 'become'} ${plural(has.unit, 'rod')}.`, `10 × ${n} = ${m}.`],
        explain: `10 × ${n} = ${m}. Every block moved one place bigger: ${plural(has.rod, 'ten')} became ${plural(has.rod, 'hundred')} and ${plural(has.unit, 'one')} became ${plural(has.unit, 'ten')}.`,
        solution: { board: solved(setup, hasOf(m)), box: String(m) },
      };
    }),
  T('area-model-13-x-12', 'Area model for 2-digit products', '4.NBT.B.5', '4',
    'Use flats, rods and units to build a rectangle for a two-digit product and add its four parts.',
    'Regions are 100, 20, 30 and 6, totalling 156. The model shows where partial products come from.',
    R => {
      const a = R.int(11, 19), b = R.int(11, 19), p = a * b, x = a - 10, y = b - 10;
      const setup = tenBoard({ mats: [{ label: 'Area model' }] });
      return {
        prompt: `Find ${a} × ${b} with an area model: a ${a} by ${b} rectangle is one flat (10 × 10), rods along two sides (10 × ${y} and ${x} × 10) and units in the corner (${x} × ${y}). Add the four parts. What is ${a} × ${b}?`,
        setup, answer: { box: { key: String(p), label: 'the product' } },
        hints: [`Split ${a} into 10 and ${x}, and ${b} into 10 and ${y}.`, `The four parts: 10 × 10 = 100, 10 × ${y} = ${10 * y}, ${x} × 10 = ${10 * x}, ${x} × ${y} = ${x * y}.`, `100 + ${10 * y} + ${10 * x} + ${x * y} = ${p}.`],
        explain: `${a} × ${b} = 100 + ${10 * y} + ${10 * x} + ${x * y} = ${p}. Each part of the rectangle is one partial product.`,
        solution: { board: setup, box: String(p) },
      };
    }),
  T('compare-two-builds', 'Compare two builds', '4.NBT.A.2', '4',
    'Two numbers are built side by side. Which is larger, and which column decides it?',
    'The tens column decides because thousands and hundreds tie. Comparing column by column from the left is the method.',
    R => {
      const at = R.int(0, 3), d = [R.int(1, 9), R.int(0, 9), R.int(0, 9), R.int(0, 9)], e = [...d];
      let x = R.int(0, 8); if (at === 0 && x === 0) x = 1;
      d[at] = x; e[at] = R.int(x + 1, 9);
      for (let i = at + 1; i < 4; i++) e[i] = R.int(0, 9);
      const A = +d.join(''), B = +e.join(''), flip = R.chance(), left = flip ? B : A, right = flip ? A : B, big = Math.max(A, B);
      const cols = ['Thousands', 'Hundreds', 'Tens', 'Ones'];
      const setup = tenBoard({ charts: [{ has: hasOf(left), locked: true, label: 'A' }, { has: hasOf(right), locked: true, label: 'B' }] });
      return {
        prompt: 'Chart A and chart B each show a number. Type the larger number, then pick the column that decides which is larger.', sig: `${left} ${right}`,
        setup, answer: { box: { key: String(big), label: 'the larger number' }, choice: { options: cols, correct: at, say: 'Compare from the left: where are the blocks first different?' } },
        hints: ['Read each chart: cubes are thousands, flats hundreds, rods tens, units ones.', 'Compare column by column from the left. Skip the columns that match.', `${fmt(left)} and ${fmt(right)} first differ in the ${cols[at]} column, so ${fmt(big)} is larger.`],
        explain: `${fmt(big)} is larger. The columns to the left of ${cols[at]} are the same, so the ${cols[at]} column decides.`,
        solution: { board: setup, box: String(big), choice: at },
      };
    }),
  T('decimal-add-1-7-0-85', 'Add decimals with blocks', '5.NBT.B.7', '5',
    'In decimals, build two numbers, combine them, and regroup hundredths into tenths (and tenths into ones). Type the sum.',
    'Regrouping works the same to the right of the decimal point. Children must name the new unit before building.',
    R => {
      let a, b;
      do { a = R.int(101, 295); b = R.int(15, 95); } while ((a % 10) + (b % 10) < 10 || a + b >= 400);
      const s = a + b, setup = tenBoard({ charts: [{ cols: DEC, has: decHasOf(a) }], decimal: true });
      return {
        prompt: `The chart shows ${dec(a)}. Add ${dec(b)} with blocks. Regroup ten hundredths into a tenth (and ten tenths into a one). What is ${dec(a)} + ${dec(b)}?`,
        setup, answer: { board: [{ t: 'total', n: s / 100, say: `Add blocks for ${dec(b)}.` }, { t: 'fewest', say: 'Regroup any ten of a kind into one bigger block.' }], box: { key: dec(s), label: 'the sum' } },
        hints: [`${dec(b)} is ${plural(Math.floor(b / 10), 'tenth')} and ${plural(b % 10, 'hundredth')}.`, `Hundredths: ${a % 10} + ${b % 10} is ten or more, so regroup ten of them into a tenth.`, `${dec(a)} + ${dec(b)} = ${dec(s)}.`],
        explain: `${dec(a)} + ${dec(b)} = ${dec(s)}. Ten hundredths make one tenth, just like ten ones make one ten.`,
        solution: { board: solved(setup, decHasOf(s)), box: dec(s) },
      };
    }),
  T('round-with-blocks', 'Round with blocks', '3.NBT.A.1', '3',
    'Build a three-digit number and use the blocks to round it to the nearest 10 or 100.',
    'Distance decides: 468 is 2 from 470 and 32 from 500 at hundred scale. Blocks make the two scales visible in turn.',
    R => {
      const to = R.pick([10, 100]); let n;
      do { n = R.int(101, 989); } while (n % 10 === 0 || (to === 10 && n % 10 === 5) || (to === 100 && n % 100 === 50));
      const r = Math.round(n / to) * to, setup = tenBoard({ charts: [{}] }), lo = Math.floor(n / to) * to, hi = lo + to;
      return {
        prompt: `Build ${n} with blocks. Round ${n} to the nearest ${to === 10 ? 'ten' : 'hundred'}.`,
        setup, answer: { board: [{ t: 'total', n, say: `Build ${n} first.` }], box: { key: String(r), label: 'rounded' } },
        hints: [`${n} is between ${lo} and ${hi}.`, `How far is ${n} from ${lo}? How far from ${hi}?`, `${n} is closer to ${r}.`],
        explain: `${n} rounds to ${r}: it is ${Math.abs(n - r)} away from ${r} and ${Math.abs((r === lo ? hi : lo) - n)} away from ${r === lo ? hi : lo}.`,
        solution: { board: solved(setup, hasOf(n)), box: String(r) },
      };
    }),
  T('factors-with-flats', 'Factors with flats', '4.OA.B.4', '4',
    'Use rods to build rectangles. Which widths work exactly? Find a factor pair.',
    'Rectangles that close exactly are factor pairs. A width of 5 leaves a gap, which is the point: not every width works.',
    R => {
      const n = R.pick([12, 16, 18, 20, 24, 28, 30, 32, 36]), ws = []; for (let w = 2; w <= n / 2; w++) if (n % w === 0) ws.push(w);
      const w = R.pick(ws), setup = tenBoard({ loose: { has: { rod: n } } });
      return {
        prompt: `There are ${n} rods on the board. Line them up in rows of ${w}. How many rows make a rectangle with no gaps?`,
        setup, answer: { box: { key: String(n / w), label: 'rows' } },
        hints: [`Drag ${w} rods into a row. Then start the next row.`, `Keep making rows of ${w} until all ${n} rods are used.`, `${n / w} rows of ${w} use all ${n}: ${n / w} × ${w} = ${n}.`],
        explain: `${n / w} × ${w} = ${n}, so ${n / w} and ${w} are a factor pair of ${n}.`,
        solution: { board: setup, box: String(n / w) },
      };
    }),
  T('thousand-cube-build', 'Thousand cube build', '2.NBT.B.8', '2',
    'Start from a number ending in 9, add one unit, and regroup step by step until the fewest blocks remain.',
    '999 + 1 cascades through every place. The final cube is worth 1000, the chant ten of these make one of those holds at each step.',
    R => {
      const a = R.int(1, 9), b = R.chance(0.4) ? 9 : R.int(0, 8), n = 100 * a + 10 * b + 9, s = n + 1;
      const setup = tenBoard({ charts: [{ has: hasOf(n) }] });
      return {
        prompt: `The chart shows ${n}. Add one unit. Then Regroup until you have the fewest blocks. What number do you have now?`,
        setup, answer: { board: [{ t: 'total', n: s, say: 'Add one unit.' }, { t: 'fewest', say: 'Regroup each ten of a kind into one bigger block.' }], box: { key: String(s), label: 'the number' } },
        hints: ['Add a unit: now there are ten units. Tap one and Regroup 10 → 1.', b === 9 ? 'Now there are ten rods. Regroup them into a flat too.' : `Count again: ${hasText(hasOf(s))}.`, `${n} + 1 = ${s}.`],
        explain: `${n} + 1 = ${s}. Ten units make a rod${b === 9 ? ', ten rods make a flat' : ''}${n === 999 ? ', and ten flats make a cube' : ''}.`,
        solution: { board: solved(setup, hasOf(s)), box: String(s) },
      };
    }),
  T('divide-by-sharing', 'Divide by sharing', '4.NBT.B.6', '4',
    'Build a two-digit number with rods and units and share it equally into groups. How much is in each group?',
    'Sharing place value pieces may need a break: 9 rods do not share by 4 until one is broken into units.',
    R => {
      let k, q, n;
      do { k = R.int(2, 5); q = R.int(11, 24); n = k * q; } while (n > 99 || Math.floor(n / 10) % k === 0);
      const setup = tenBoard({ charts: [{ has: hasOf(n) }] });
      return {
        prompt: `Share ${n} equally into ${k} groups. Use the blocks: share the rods first, then break a rod into units when you need to. How much is in each group?`,
        setup, answer: { box: { key: String(q), label: 'in each group' } },
        hints: [`${n} is ${hasText(hasOf(n))}. Give each of the ${k} groups the same number of rods.`, `${Math.floor(n / 10) % k === 0 ? '' : 'A rod is left over: break it into ten units. '}Now share the units.`, `${n} ÷ ${k} = ${q}.`],
        explain: `${n} ÷ ${k} = ${q}, because ${k} × ${q} = ${n}.`,
        solution: { board: setup, box: String(q) },
      };
    }),
  T('zero-in-the-middle', 'Zero in the middle', '2.NBT.A.3', '2',
    'Build a number with a zero in it. Which place does the zero hold, and why does it matter?',
    'In 505 the zero holds the tens place, in 550 it holds the ones. Same digit, different job depending on position.',
    R => {
      const h = R.int(1, 9), x = R.int(1, 9), z = R.int(1, 2), n = z === 1 ? 100 * h + x : 100 * h + 10 * x;
      const setup = tenBoard({ charts: [{}] }), places = ['Hundreds', 'Tens', 'Ones'];
      return {
        prompt: `Build ${n} in the place-value chart with the fewest blocks. Which place has no blocks (the zero)?`,
        setup, answer: { board: [{ t: 'total', n, say: `The blocks should show ${n}.` }, { t: 'fewest', say: 'Use the fewest blocks: no ten of a kind.' }, { t: 'inChart', say: 'Put every block in its own column of the chart.' }],
          choice: { options: places, correct: z, say: 'Which column is empty?' } },
        hints: [`${n}: ${hasText(hasOf(n))}.`, 'Look at the chart: which column has no blocks?', `The ${places[z]} column is empty, so the zero is in the ${places[z].toLowerCase()} place.`],
        explain: `In ${n} the zero holds the ${places[z].toLowerCase()} place. Without it, the number would read ${String(n).replace('0', '')}.`,
        solution: { board: solved(setup, hasOf(n)), choice: z },
      };
    }),
  T('estimate-the-build', 'Estimate the build', '3.NBT.A.2', '3',
    'Look at a build of flats, rods and units and say the total without counting one by one.',
    'Quick looks force children to use place value chunks rather than counting units. Estimates within 10 percent are strong.',
    R => {
      const has = { flat: R.int(1, 5), rod: R.int(1, 9), unit: R.int(1, 9) }, n = 100 * has.flat + 10 * has.rod + has.unit;
      const setup = tenBoard({ loose: { has, locked: true } });
      return {
        prompt: 'Look at the blocks. Count by flats, rods and units, not one by one. What number do they show?', sig: String(n),
        setup, answer: { box: { key: String(n), label: 'the number' } },
        hints: ['Start with the flats: each one is 100.', `${plural(has.flat, 'flat')} ${has.flat === 1 ? 'is' : 'are'} ${has.flat * 100}. Then count the rods by tens.`, `${has.flat * 100} + ${has.rod * 10} + ${has.unit} = ${n}.`],
        explain: `${hasText(has)}: ${has.flat * 100} + ${has.rod * 10} + ${has.unit} = ${n}.`,
        solution: { board: setup, box: String(n) },
      };
    }),
];
