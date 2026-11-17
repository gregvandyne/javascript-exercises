// Classroom dashboards, stage 3: the maths behind the teaching tools (docs/decisions.md "Classroom dashboards, stage 3").
// Pure functions only: no DOM, no network, no storage. public/js/dash-tools.js draws with them; tests/unit/dash-stage3.test.js
// checks them. Fractions are kept exact (whole numerators and denominators), never as floating point, so 1/3 + 1/3 + 1/3
// is 1 and a number line's ticks land exactly where they should.

export const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
export const lcm = (a, b) => Math.abs(a * b) / gcd(a, b);
/** n/d in lowest terms, the sign on the numerator. */
export function simplify(n, d) {
  if (!d) return { n: 0, d: 1 };
  const g = gcd(n, d), s = d < 0 ? -1 : 1;
  return { n: (s * n) / g, d: Math.abs(d) / g };
}
/** -1, 0 or 1: a/b against c/d (positive denominators). */
export const compare = (a, b) => Math.sign(a.n * b.d - b.n * a.d);
/** The least common denominator of some fractions, and each one written over it. */
export function commonDenominator(fracs) {
  const L = fracs.reduce((m, f) => lcm(m, f.d), 1);
  return { L, list: fracs.map(f => ({ n: (f.n * L) / f.d, d: L })) };
}
/** Fractions in order with the signs between them: [{ f, i }] and ['<', '='...]. Equal ones keep their order. */
export function ordered(fracs) {
  const list = fracs.map((f, i) => ({ f, i })).sort((a, b) => compare(a.f, b.f) || a.i - b.i);
  return { list, signs: list.slice(1).map((x, k) => (compare(list[k].f, x.f) === 0 ? '=' : '<')) };
}
/** Whether two fractions are equivalent (2/4 and 1/2). */
export const equivalent = (a, b) => compare(a, b) === 0;

// ---------------------------------------------------------------- adding, subtracting and multiplying fractions
// The fraction tool's Add, Subtract and Multiply modes (docs/decisions.md "Classroom dashboards: help on the maths
// tools"). Each operation is an entry in OPS (add, subtract, multiply, divide).
/** What each fraction in an operation may be: a bottom number 1-12, a top number 0-12 and at most three wholes. */
export const OP_LIMITS = { dMax: 12, nMax: 12, wholes: 3 };
/** The operations' starting fractions (server/services/dash-tools.js keeps the same, tested). */
export const OP_START = { a: { n: 1, d: 2 }, b: { n: 1, d: 3 } };
/** A fraction kept inside OP_LIMITS (whole numbers; the top number never more than three wholes). */
export function clampOperand(f) {
  const d = Math.max(1, Math.min(OP_LIMITS.dMax, Math.round(Number(f && f.d)) || 1));
  const n = Math.max(0, Math.min(OP_LIMITS.nMax, OP_LIMITS.wholes * d, Math.round(Number(f && f.n)) || 0));
  return { n, d };
}
/** A fraction as a whole number and a part: 7/6 -> { sign: 1, whole: 1, n: 1, d: 6 }; -1/4 -> { sign: -1, whole: 0, n: 1, d: 4 }. */
export function mixedParts(f) {
  const s = simplify(f.n, f.d), a = Math.abs(s.n);
  return { sign: s.n < 0 ? -1 : 1, whole: Math.floor(a / s.d), n: a % s.d, d: s.d };
}
/** A fraction in lowest terms as text, a mixed number when it is more than one whole: "5/6", "1 1/6", "2", "−1/6". */
export function mixedText(f) {
  const m = mixedParts(f), sign = m.sign < 0 ? '−' : '';
  if (!m.n) return `${sign}${m.whole}`;
  return m.whole ? `${sign}${m.whole} ${m.n}/${m.d}` : `${sign}${m.n}/${m.d}`;
}
/** A fraction as written, not simplified: "6/12", "−1/6". */
export const fracRaw = f => `${f.n < 0 ? '−' : ''}${Math.abs(f.n)}/${f.d}`;
/**
 * The operations. Each takes two fractions and gives:
 *   L     the bottom number the work is done in (the least common denominator to add or subtract; the product of the
 *         bottom numbers to multiply)
 *   a2 b2 the two fractions written over L when adding or subtracting (the same-size pieces), else as they are
 *   raw   the answer before simplifying (5/6, 6/12, -1/6...)
 */
export const OPS = {
  add: { sign: '+', run(a, b) { const c = commonDenominator([a, b]); return { L: c.L, a2: c.list[0], b2: c.list[1], raw: { n: c.list[0].n + c.list[1].n, d: c.L } }; } },
  sub: { sign: '−', run(a, b) { const c = commonDenominator([a, b]); return { L: c.L, a2: c.list[0], b2: c.list[1], raw: { n: c.list[0].n - c.list[1].n, d: c.L } }; } },
  mul: { sign: '×', run(a, b) { return { L: a.d * b.d, a2: { ...a }, b2: { ...b }, raw: { n: a.n * b.n, d: a.d * b.d } }; } },
  // How many of the second fit in the first: both over the same bottom number to measure one with the other, and
  // worked as a/b × d/c (the second turned over). The second is never zero (operate keeps its top number at least 1).
  div: { sign: '÷', run(a, b) { const c = commonDenominator([a, b]); return { L: c.L, a2: c.list[0], b2: c.list[1], flip: { n: b.d, d: b.n }, raw: { n: a.n * b.d, d: a.d * b.n } }; } },
};
/** The modes of the fraction tool: Compare and the operations, in the order of its switch. */
export const FRACTION_MODES = ['compare', ...Object.keys(OPS)];
/**
 * a op b, exactly: { op, sign, a, b, guarded (dividing by 0 was turned into dividing by 1/d), L, flip (divide: the second
 * turned over), a2, b2, raw, simple (lowest terms), mixed (text), negative, whole (a whole
 * number), more (more than one whole and not a whole number, so a mixed number says it best) }.
 */
export function operate(op, a, b) {
  const o = OPS[op]; if (!o) return null;
  a = clampOperand(a); b = clampOperand(b);
  // Nothing can be divided by zero: the divisor's top number is at least 1 (guarded says it was raised).
  const guarded = op === 'div' && b.n === 0; if (guarded) b = { n: 1, d: b.d };
  const r = o.run(a, b), simple = simplify(r.raw.n, r.raw.d);
  return { op, sign: o.sign, a, b, guarded, ...r, simple, mixed: mixedText(simple), negative: simple.n < 0, whole: simple.d === 1, more: Math.abs(simple.n) > simple.d && simple.d > 1 };
}

// ---------------------------------------------------------------- spoken fractions (English; other languages say "3 of 8")
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORD = { 1: 'whole', 2: 'half', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth', 11: 'eleventh', 12: 'twelfth', 20: 'twentieth', 100: 'hundredth' };
export function numberWords(n) {
  if (n < 0) return `minus ${numberWords(-n)}`;
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ''}`;
  return String(n);
}
function ordinal(d) {
  if (ORD[d]) return ORD[d];
  if (d < 20) return `${ONES[d]}th`;
  if (d < 100) { const t = TENS[Math.floor(d / 10)]; return d % 10 ? `${t}-${ORD[d % 10] || `${ONES[d % 10]}th`}` : `${t.slice(0, -1)}ieth`; }
  return `${numberWords(d)}th`;
}
/** "three eighths", "one half", "two wholes". English only: other languages read the numbers ("3 of 8"). */
export function fractionWords(n, d) {
  if (d === 1) return n === 1 ? 'one whole' : `${numberWords(n)} wholes`;
  let o = ordinal(d);
  if (n !== 1) o = o === 'half' ? 'halves' : `${o}s`;
  return `${numberWords(n)} ${o}`;
}

// ---------------------------------------------------------------- the number line: ticks are whole numbers of 1/sub
/** A tick's value as a fraction in lowest terms. */
export const tickValue = (tick, sub) => simplify(tick, sub);
/** How a value is written on the line. mode: 'whole' | 'fraction' (mixed numbers: 1 1/4) | 'decimal'. Minus is U+2212. */
export function tickLabel(tick, sub, mode = 'fraction') {
  const v = simplify(tick, sub), neg = v.n < 0, a = Math.abs(v.n), sign = neg ? '−' : '';
  if (v.d === 1) return `${sign}${a}`;
  if (mode === 'decimal') return `${sign}${decimalString(a, v.d)}`;
  const whole = Math.floor(a / v.d), rest = a % v.d;
  return whole ? `${sign}${whole} ${rest}/${v.d}` : `${sign}${rest}/${v.d}`;
}
/** Where a tick sits between x0 and x1 when the line runs from tick lo to tick hi. */
export const tickX = (tick, lo, hi, x0, x1) => x0 + ((tick - lo) / Math.max(1, hi - lo)) * (x1 - x0);
/** The nearest tick to x (clamped to the line). */
export const nearestTick = (x, lo, hi, x0, x1) => Math.max(lo, Math.min(hi, Math.round(lo + ((x - x0) / (x1 - x0)) * (hi - lo))));
/** A jump's size, signed: "+3/4", "−2". */
export function jumpLabel(from, to, sub, mode = 'fraction') { const d = to - from; return `${d >= 0 ? '+' : ''}${tickLabel(d, sub, mode)}`; }
/** Which ticks get a label: every one when there is room, else the whole numbers, else every k-th whole number. */
export function labelEvery(lo, hi, sub, room) {
  const ticks = hi - lo;
  if (ticks <= room) return 1;
  const wholes = ticks / sub;
  for (const k of [1, 2, 5, 10, 20, 25, 50, 100, 200, 500]) if (wholes / k <= room) return sub * k;
  return sub * 1000;
}

// ---------------------------------------------------------------- decimals and percents, repeating ones shown sensibly
/** n/d (n >= 0, d > 0) as decimal digits: { int, nonrep, rep } where rep repeats for ever ('' when it ends). */
export function decimalParts(n, d) {
  const int = Math.floor(n / d);
  let r = n % d; const digits = [], seen = new Map();
  while (r && !seen.has(r) && digits.length < 200) { seen.set(r, digits.length); r *= 10; digits.push(Math.floor(r / d)); r %= d; }
  if (!r) return { int, nonrep: digits.join(''), rep: '' };
  const at = seen.get(r);
  return { int, nonrep: digits.slice(0, at).join(''), rep: digits.slice(at).join('') };
}
/** "0.125", "0.333…" (a one-digit repeat shown three times), "0.1666…", "0.0909…", "0.142857…". */
export function decimalString(n, d, { times } = {}) {
  const neg = n < 0 !== d < 0 && n !== 0; n = Math.abs(n); d = Math.abs(d);
  const p = decimalParts(n, d), sign = neg ? '−' : '';
  if (!p.rep) return `${sign}${p.int}${p.nonrep ? `.${p.nonrep}` : ''}`;
  const k = times || (p.rep.length === 1 ? 3 : p.rep.length === 2 ? 2 : 1);
  return `${sign}${p.int}.${p.nonrep}${p.rep.repeat(k)}…`;
}
/** n/d as a percent: "12.5%", "33.3…%", "16.6…%", "100%". The repeat is shown once. */
export function percentString(n, d) {
  const p = decimalParts(Math.abs(n) * 100, Math.abs(d));
  const sign = n < 0 !== d < 0 && n !== 0 ? '−' : '';
  if (!p.rep) return `${sign}${p.int}${p.nonrep ? `.${p.nonrep}` : ''}%`;
  return `${sign}${p.int}.${p.nonrep}${p.rep}…%`;
}
/** A 10 x 10 grid for n/d: how many whole squares are shaded and how much of the next one (0 <= part < 1). */
export function hundredGrid(n, d) {
  const exact = (Math.max(0, Math.min(n, d)) * 100) / d;
  const full = Math.floor(exact + 1e-9);
  return { full, part: Math.max(0, exact - full) < 1e-9 ? 0 : exact - full };
}

// ---------------------------------------------------------------- the coordinate plane: y = mx + b, m a fraction
/** The slopes the + and − buttons step through: whole numbers and the friendly fractions (rise over run). */
export const SLOPES = [[-5, 1], [-4, 1], [-3, 1], [-2, 1], [-3, 2], [-1, 1], [-2, 3], [-1, 2], [-1, 3], [-1, 4], [0, 1], [1, 4], [1, 3], [1, 2], [2, 3], [1, 1], [3, 2], [2, 1], [3, 1], [4, 1], [5, 1]].map(([n, d]) => ({ n, d }));
/** A typed slope ("2", "−1/2", "3/2", "0.5", "2/4") -> its place in SLOPES, or null when it is not one of them. */
export function slopeOfText(text) {
  const x = String(text ?? '').replace(/\s/g, '').replace(/^[−–]/, '-').replace(',', '.');
  let n, d = 1;
  const f = /^(-?\d+)\/(\d+)$/.exec(x);
  if (f) { n = +f[1]; d = +f[2]; } else if (/^-?(\d+(\.\d+)?|\.\d+)$/.test(x)) { const v = Number(x); d = 100; n = Math.round(v * 100); if (Math.abs(n / 100 - v) > 1e-9) return null; } else return null;
  if (!d) return null;
  const i = SLOPES.findIndex(s => s.n * d === n * s.d);
  return i < 0 ? null : i;
}
export const slopeIndex = m => { const i = SLOPES.findIndex(s => s.n === m.n && s.d === m.d); return i < 0 ? SLOPES.findIndex(s => s.n === 1 && s.d === 1) : i; };
/** y at x on y = mx + b, exact: { n, d }. */
export const lineY = (m, b, x) => simplify(m.n * x + b * m.d, m.d);
/** A table of values. */
export const valueTable = (m, b, xs) => xs.map(x => ({ x, y: lineY(m, b, x) }));
/** The line's two ends inside the box [x0, x1] x [y0, y1] (graph units), or null when it misses the box. */
export function lineInBox(m, b, x0, x1, y0, y1) {
  const f = x => (m.n * x) / m.d + b, g = y => ((y - b) * m.d) / m.n;
  const pts = [];
  const add = (x, y) => { if (x >= x0 - 1e-9 && x <= x1 + 1e-9 && y >= y0 - 1e-9 && y <= y1 + 1e-9 && !pts.some(p => Math.abs(p[0] - x) < 1e-9 && Math.abs(p[1] - y) < 1e-9)) pts.push([x, y]); };
  add(x0, f(x0)); add(x1, f(x1));
  if (m.n) { add(g(y0), y0); add(g(y1), y1); }
  if (pts.length < 2) return null;
  pts.sort((a, b2) => a[0] - b2[0]);
  return [pts[0], pts[pts.length - 1]];
}
/** A fraction as text: "3", "−2/3", "5/3". */
export const fracText = f => { const s = simplify(f.n, f.d); return s.d === 1 ? `${s.n < 0 ? '−' : ''}${Math.abs(s.n)}` : `${s.n < 0 ? '−' : ''}${Math.abs(s.n)}/${s.d}`; };
/** The equation's pieces: [{ t: 'y = ' }, { f: {n,d} } (a slope fraction), { t: 'x' }, ...]. */
export function equationParts(m, b) {
  const out = [{ t: 'y = ' }];
  const s = simplify(m.n, m.d);
  if (s.n !== 0) {
    if (s.d === 1) out.push({ t: s.n === 1 ? '' : s.n === -1 ? '−' : `${s.n < 0 ? '−' : ''}${Math.abs(s.n)}` });
    else { if (s.n < 0) out.push({ t: '−' }); out.push({ f: { n: Math.abs(s.n), d: s.d } }); }
    out.push({ t: 'x' });
    if (b) out.push({ t: ` ${b > 0 ? '+' : '−'} ${Math.abs(b)}` });
  } else out.push({ t: `${b < 0 ? '−' : ''}${Math.abs(b)}` });
  return out.filter(p => p.f || p.t !== '');
}
export const equationText = (m, b) => equationParts(m, b).map(p => (p.f ? `${p.f.n}/${p.f.d}` : p.t)).join('');

// ---------------------------------------------------------------- graphs
/** A friendly axis for values up to max: { top, step } with 4-6 steps of 1, 2, 5, 10, 20, 25, 50... */
export function niceScale(max) {
  const m = Math.max(1, Math.ceil(max));
  for (const step of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) { const top = Math.ceil(m / step) * step; if (top / step <= 6) return { top, step }; }
  return { top: Math.ceil(m / 1000) * 1000, step: 1000 };
}

// ---------------------------------------------------------------- base-ten blocks and place value
export const BASE10_MAX = { h: 9, t: 19, o: 19 };
export const blocksValue = s => 100 * s.h + 10 * s.t + s.o;
/** Trade: 'o' up (10 ones for a ten), 't' up (10 tens for a hundred), 't' down (a ten for 10 ones), 'h' down (a hundred
 *  for 10 tens). The value never changes. -> the new blocks, or null when the trade can't happen. */
export function trade(s, place, dir) {
  const x = { ...s };
  if (dir === 'up' && place === 'o' && x.o >= 10 && x.t < BASE10_MAX.t) { x.o -= 10; x.t += 1; }
  else if (dir === 'up' && place === 't' && x.t >= 10 && x.h < BASE10_MAX.h) { x.t -= 10; x.h += 1; }
  else if (dir === 'down' && place === 't' && x.t >= 1 && x.o + 10 <= BASE10_MAX.o) { x.t -= 1; x.o += 10; }
  else if (dir === 'down' && place === 'h' && x.h >= 1 && x.t + 10 <= BASE10_MAX.t) { x.h -= 1; x.t += 10; }
  else return null;
  return x;
}
/** Place value chart columns, biggest first; the value is kept as a whole number of thousandths. */
export const PLACES = [{ k: 'thousands', p: 1e6 }, { k: 'hundreds', p: 1e5 }, { k: 'tens', p: 1e4 }, { k: 'ones', p: 1e3 }, { k: 'tenths', p: 100 }, { k: 'hundredths', p: 10 }, { k: 'thousandths', p: 1 }];
export const PV_MAX = 9999999;   // 9,999.999 in thousandths
export const pvDigits = v => PLACES.map(c => Math.floor(v / c.p) % 10);
/** Add or take one of a place (10 of one place make one of the next: the digits carry and borrow). null when out of range. */
export function pvAdd(v, i, delta) { const x = v + delta * PLACES[i].p; return x < 0 || x > PV_MAX ? null : x; }
/** × 10 and ÷ 10 move every digit one place. ÷ 10 needs the thousandths digit to be 0 (no ten-thousandths here). */
export const pvTimes10 = v => (v * 10 > PV_MAX ? null : v * 10);
export const pvDiv10 = v => (v % 10 ? null : v / 10);
/** The value in the reader's number format: "3,405.27" (no trailing zeros after the point). */
export function pvFormat(v, intl = 'en') {
  const int = Math.floor(v / 1000), frac = String(v % 1000).padStart(3, '0').replace(/0+$/, '');
  const f = new Intl.NumberFormat(intl, { minimumFractionDigits: frac.length, maximumFractionDigits: frac.length });
  return f.format(Number(`${int}.${frac || '0'}`));
}
/** Expanded form: the non-zero places, biggest first, as numbers (300, 40, 0.2...). */
export const pvExpanded = v => PLACES.map((c, i) => ({ i, digit: pvDigits(v)[i], value: (pvDigits(v)[i] * c.p) / 1000 })).filter(x => x.digit);

// ---------------------------------------------------------------- area model
/** Partial products of a x b, each side split in two at splitA / splitB (0 = not split). */
export function partialProducts(a, b, splitA = 0, splitB = 0) {
  const sa = splitA > 0 && splitA < a ? [splitA, a - splitA] : [a], sb = splitB > 0 && splitB < b ? [splitB, b - splitB] : [b];
  const parts = [];
  sa.forEach((x, i) => sb.forEach((y, j) => parts.push({ i, j, a: x, b: y, p: x * y })));
  return { rows: sa, cols: sb, parts, total: parts.reduce((s, x) => s + x.p, 0) };
}
/** The place-value split: 23 -> 20 (and 3); a one-digit number isn't split. */
export const placeSplit = n => (n >= 10 && n % 10 ? n - (n % 10) : 0);

// ---------------------------------------------------------------- hundreds chart
/** Skip counting by n on a chart starting at 0 or 1 (to 99 or 100): the numbers counted (n, 2n, 3n...). */
export function skipCount(n, start = 1, upto = 100) {
  const out = []; if (n < 1) return out;
  for (let x = n; x <= (start ? upto : 99); x += n) out.push(x);
  return out;
}

// ---------------------------------------------------------------- the teaching clock (minutes since midnight)
export const DAY_MIN = 1440;
export const wrapMin = m => ((Math.round(m) % DAY_MIN) + DAY_MIN) % DAY_MIN;
/** Hand angles in degrees, clockwise from 12. The hour hand moves with the minutes (half a degree a minute). */
export const handAngles = min => { const m = wrapMin(min); return { hour: ((m % 720) / 60) * 30, minute: (m % 60) * 6 }; };
/** The minute hand dragged to an angle: the new time, keeping the hour moving with it (past 12 goes to the next hour). */
export function dragMinute(min, deg) {
  const cur = wrapMin(min), want = Math.round((((deg % 360) + 360) % 360) / 6) % 60, was = cur % 60;
  let delta = want - was;
  if (delta > 30) delta -= 60; else if (delta < -30) delta += 60;
  return wrapMin(cur + delta);
}
/** The hour hand dragged to an angle: the nearest time (to the minute) on the same half of the day as now when close. */
export function dragHour(min, deg) {
  const cur = wrapMin(min), want = Math.round(((((deg % 360) + 360) % 360) / 30) * 60) % 720, was = cur % 720;
  let delta = want - was;
  if (delta > 360) delta -= 720; else if (delta < -360) delta += 720;
  return wrapMin(cur + delta);
}
/** Minutes from start to end, going forward (across noon and midnight). */
export const elapsed = (start, end) => wrapMin(end - start);
/** Elapsed time in friendly jumps: to the next hour, whole hours, then the minutes left. [{ from, to, mins }] */
export function elapsedJumps(start, end) {
  const total = elapsed(start, end), out = [];
  let at = wrapMin(start), left = total;
  const step = n => { out.push({ from: at, to: wrapMin(at + n), mins: n }); at = wrapMin(at + n); left -= n; };
  if (left && at % 60) step(Math.min(left, 60 - (at % 60)));
  if (left >= 60) step(Math.floor(left / 60) * 60);
  if (left) step(left);
  return out;
}
/** 12-hour parts: { h (1-12), m, pm }. */
export const clockParts = min => { const m = wrapMin(min), h24 = Math.floor(m / 60); return { h: h24 % 12 || 12, h24, m: m % 60, pm: h24 >= 12 }; };
/** "1 h 35 min"-style pieces: { h, m }. */
export const hm = mins => ({ h: Math.floor(mins / 60), m: mins % 60 });
