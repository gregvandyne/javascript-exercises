// Independent solvers for the Sorting Game's rung 6.0-8.0 items (tests/unit/number-quest-placement-pro.test.js).
// Each solver reads ONE thing, the prompt a learner sees, and works the answer out its own way (counting,
// searching, sorting, a shoelace sum, a small expression parser): it never looks at the item's key, its
// distractors or the generator's formulas. It returns a predicate, isRight(choice), so the test can ask of every
// choice on the buttons "is this one correct?" and demand that exactly one is. Two choices that print differently
// but mean the same ("1/2" and "2/4", "3x + 12" and "12 + 3x") would both count, which is the point.

const MINUS = '−';
const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const eq = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
const plain = s => String(s).replaceAll(MINUS, '-');
/** A printed number as a value: 7, "−7", "3/4", "−1/2", "9 1/2", "0.375", "−8°C". NaN when it is not a number. */
export function numOf(v) {
  if (typeof v === 'number') return v;
  const s = plain(v).replace(/°C?$/, '').trim();
  let m = /^(-?)(\d+) (\d+)\/(\d+)$/.exec(s); if (m) return (m[1] ? -1 : 1) * (+m[2] + +m[3] / +m[4]);
  m = /^(-?\d+)\/(\d+)$/.exec(s); if (m) return +m[1] / +m[2];
  return /^-?\d+(?:\.\d+)?$/.test(s) ? +s : NaN;
}
/** Every number in a text, in order, signs kept. */
const nums = s => (plain(s).match(/(?<![\w.])-?\d+(?:\.\d+)?/g) || []).map(Number);
const points = s => [...plain(s).matchAll(/\((-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\)/g)].map(m => [+m[1], +m[2]]);
const numIs = want => v => eq(numOf(v), want);

/** A small expression reader: numbers, one-letter variables, + and − (either minus sign), a number or a bracket
 *  set against a variable or a bracket (a product), brackets, and superscript powers. "y = ..." reads its right side. */
export function evalExpr(text, vars = {}) {
  const s = plain(String(text).replace(/^\s*[a-z]\s*=\s*/, '')).replace(/\s+/g, '');
  let i = 0;
  const peek = () => s[i];
  function power(base) {
    let e = '';
    while (i < s.length && SUPS.includes(s[i])) e += SUPS.indexOf(s[i++]);
    return e ? base ** +e : base;
  }
  function factor() {
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') throw new Error(`unclosed bracket in ${text}`); return power(v); }
    const m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (m) { i += m[0].length; return power(+m[0]); }
    if (/[a-z]/.test(peek() || '')) { const name = s[i++]; if (!(name in vars)) throw new Error(`unknown variable ${name} in ${text}`); return power(vars[name]); }
    throw new Error(`cannot read "${text}" at ${i}`);
  }
  function term() {
    let v = factor();
    while (i < s.length && (/[a-z(\d]/.test(peek()) || peek() === '×')) { if (peek() === '×') i++; v *= factor(); }
    return v;
  }
  function expr() {
    let v = term();
    while (i < s.length && (peek() === '+' || peek() === '-')) { const op = s[i++]; const t = term(); v = op === '+' ? v + t : v - t; }
    return v;
  }
  const out = expr();
  if (i !== s.length) throw new Error(`trailing text in "${text}"`);
  return out;
}
/** Are two expressions in one variable equal for every value tried (whole numbers, a fraction, a negative)? */
const sameExpr = (name, a, b) => { try { return [0, 1, 2, 3, 5, 7, -4, 2.5].every(x => eq(evalExpr(a, { [name]: x }), evalExpr(b, { [name]: x }))); } catch { return false; } };
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const need = (m, prompt) => { if (!m) throw new Error(`solver could not read: ${prompt}`); return m; };
/** The numbers of a list written "4, 7, 9 and 5" that follows `after` and ends before `before`. */
const listed = (prompt, after, before) => nums(need(new RegExp(`${after}(.+?)${before}`).exec(plain(prompt)), prompt)[1]);

export const SOLVERS = {
  // ---------------------------------------------------------------------------------------------- Number
  fracDivide(p) { const m = need(/holds (\d+)\/(\d+) of a liter\. How many jars can be filled from (.+?) liters? of juice/.exec(p), p); const jar = +m[1] / +m[2], total = numOf(m[3]); let n = 0; while ((n + 1) * jar <= total + 1e-9) n++; return numIs(n); },
  signedOrder(p) { const all = listed(p, ': ', '\\?'); return numIs(/coldest/.test(p) ? Math.min(...all) : Math.max(...all)); },
  farthestFromZero(p) { const all = listed(p, ': ', '\\?'); return numIs([...all].sort((a, b) => Math.abs(b) - Math.abs(a))[0]); },
  oppositeOf(p) { const [n] = nums(p); return v => eq(numOf(v) + n, 0) && !eq(numOf(v), n); },
  decimalMul(p) { const [a, b] = nums(p); return numIs(Math.round(a * 10) * Math.round(b * 10) / 100); },
  decimalDiv(p) { const [a, b] = nums(p); return numIs(Math.round(a * 10) / Math.round(b * 10)); },
  gcfLcm(p) {
    const [a, b] = nums(p);
    if (/least common multiple/.test(p)) { let k = Math.max(a, b); while (k % a || k % b) k++; return numIs(k); }
    let k = Math.min(a, b); while (a % k || b % k) k--; return numIs(k);
  },
  lineDistance(p) { const [a, b] = nums(p); let steps = 0; for (let x = Math.min(a, b); x < Math.max(a, b); x++) steps++; return numIs(steps); },
  signedAdd(p) { const [a, b] = nums(p); return numIs(a + b); },
  signedSub(p) { const m = need(/is (-?\d+) - \((-?\d+)\)/.exec(plain(p)), p); return numIs(+m[1] - +m[2]); },
  signedMul(p) { const m = need(/is (-?\d+) × \(?(-?\d+)\)?/.exec(plain(p)), p); let total = 0; for (let k = 0; k < Math.abs(+m[2]); k++) total += +m[1]; return numIs(+m[2] < 0 ? -total : total); },
  signedStory(p) { const m = need(/is(?: at)? (-?\d+)(?: meters|°C)\. \w+ rises (\d+)(?: meters|°) and then (?:sinks|falls) (\d+)/.exec(plain(p)), p); let at = +m[1]; for (let k = 0; k < +m[2]; k++) at++; for (let k = 0; k < +m[3]; k++) at--; return numIs(at); },
  signedDiv(p) { const m = need(/is (-?\d+) ÷ \(?(-?\d+)\)?/.exec(plain(p)), p); for (let q = -200; q <= 200; q++) if (q * +m[2] === +m[1]) return numIs(q); throw new Error(`no whole quotient: ${p}`); },
  fracToDecimal(p) { const m = need(/Write (\d+)\/(\d+) as a decimal/.exec(p), p); return numIs(+m[1] / +m[2]); },
  rationalMix(p) { const m = need(/is (-?[\d.]+) × (\d+) \+ (\d+)/.exec(plain(p)), p); return numIs(+m[1] * +m[2] + +m[3]); },
  tankRate(p) { const m = need(/holds (\d+) liters of water\. It loses ([\d.]+) liters every hour\. How many liters are left after (\d+) hours/.exec(p), p); let left = +m[1]; for (let h = 0; h < +m[3]; h++) left -= +m[2]; return numIs(left); },
  sqrtPerfect(p) { const n = +need(/√(\d+)/.exec(p), p)[1]; for (let k = 1; k <= n; k++) if (k * k === n) return numIs(k); throw new Error(`not a perfect square: ${p}`); },
  cubeRoot(p) { const n = +need(/cube root of (\d+)/.exec(p), p)[1]; for (let k = 1; k <= n; k++) if (k * k * k === n) return numIs(k); throw new Error(`not a perfect cube: ${p}`); },
  sqrtBetween(p) { const n = +need(/√(\d+)/.exec(p), p)[1]; return v => { const m = /^(\d+) and (\d+)$/.exec(String(v)); return !!m && +m[2] === +m[1] + 1 && +m[1] * +m[1] < n && n < +m[2] * +m[2]; }; },
  expLaw(p) {
    const read = t => { const m = /^(\d+)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/.exec(t); return m ? BigInt(m[1]) ** BigInt([...m[2]].map(c => SUPS.indexOf(c)).join('')) : null; };
    const m = need(/equal to (\S+) × (\S+)\?/.exec(p), p), want = read(m[1]) * read(m[2]);
    return v => read(String(v)) === want;
  },
  // ---------------------------------------------------------------------------------------------- Algebra
  ratioScale(p) { const m = need(/uses (\d+) cups? of flour for every (\d+) cups? of milk\. You use (\d+) cups? of flour/.exec(p), p); return numIs(+m[2] * (+m[3] / +m[1])); },
  percentOf(p) { const m = need(/What is (\d+)% of (\d+)\?/.exec(p), p); return numIs(+m[2] / 100 * +m[1]); },
  rateNeutral(p) { const m = need(/(\d+) \w+ in (\d+) minutes at a steady rate/.exec(p), p); return numIs(+m[1] / +m[2]); },
  ratioTable(p) { const m = need(/(\d+) goes with (\d+) and (\d+) goes with (\d+)\. What goes with (\d+)\?/.exec(p), p); if (!eq(+m[2] / +m[1], +m[4] / +m[3])) throw new Error(`not one ratio: ${p}`); return numIs(+m[5] * +m[2] / +m[1]); },
  exprEval(p) { const m = need(/If x = (\d+), what is (.+)\?/.exec(p), p); return numIs(evalExpr(m[2], { x: +m[1] })); },
  equation(p) { const m = need(/Solve: (.+) = (\d+)\. What is x\?/.exec(p), p); for (let x = -100; x <= 100; x++) if (eq(evalExpr(m[1], { x }), +m[2])) return numIs(x); throw new Error(`no whole solution: ${p}`); },
  exprWrite(p) {
    const m = need(/"(\d+) (more|less) than (\d+) times n"/.exec(p), p);
    const want = n => (m[2] === 'more' ? +m[3] * n + +m[1] : +m[3] * n - +m[1]);
    return v => { try { return [0, 1, 2, 3, 5, 7, -4, 2.5].every(n => eq(evalExpr(v, { n }), want(n))); } catch { return false; } };
  },
  inequalityTruth(p) { const m = need(/x \+ (\d+) ([<>]) (\d+) true/.exec(p), p); return v => (m[2] === '>' ? numOf(v) + +m[1] > +m[3] : numOf(v) + +m[1] < +m[3]); },
  propSolve(p) { const m = need(/(\d+)\/(\d+) = ___\/(\d+)/.exec(p), p); return numIs(+m[1] * +m[3] / +m[2]); },
  constantK(p) { const xs = listed(p, 'When x is ', ', y is'), ys = listed(p, ', y is ', '\\. What'); const k = ys[0] / xs[0]; if (!xs.every((x, i) => eq(ys[i] / x, k))) throw new Error(`not proportional: ${p}`); return numIs(k); },
  isProportional() { return v => { const ps = points(v); return ps.length === 3 && ps.every(q => eq(q[1] / q[0], ps[0][1] / ps[0][0])); }; },
  percentChange(p) { const m = need(/(?:held|was) (\d+) (?:liters|cm tall)\. Now it (?:holds|is) (\d+)/.exec(p), p); return numIs(Math.abs(+m[2] - +m[1]) / +m[1] * 100); },
  distribute(p) { const src = need(/equal to (.+)\?/.exec(p), p)[1]; return v => sameExpr('x', v, src); },
  combineLike(p) { const src = need(/equal to (.+)\?/.exec(p), p)[1]; return v => sameExpr('x', v, src); },
  twoStepNeg(p) { const m = need(/Solve: (.+) = (-?\d+)\. What is x\?/.exec(plain(p)), p); for (let x = -100; x <= 100; x++) if (eq(evalExpr(m[1], { x }), +m[2])) return numIs(x); throw new Error(`no whole solution: ${p}`); },
  slopeTwoPoints(p) { const [a, b] = points(p); return numIs((b[1] - a[1]) / (b[0] - a[0])); },
  lineFromTable(p) { const ys = listed(p, 'and y = ', '\\. Which'); return v => { try { return [0, 1, 2, 3].every(x => eq(evalExpr(v, { x }), ys[x])); } catch { return false; } }; },
  linearSolve(p) { const m = need(/Solve: (.+) = (.+)\. What is x\?/.exec(p), p); for (let x = -100; x <= 100; x++) if (eq(evalExpr(m[1], { x }), evalExpr(m[2], { x }))) return numIs(x); throw new Error(`no whole solution: ${p}`); },
  systemMeet(p) { const m = need(/Line P is (.+?)\. Line Q is (.+?)\. At what/.exec(p), p); for (let x = -100; x <= 100; x++) if (eq(evalExpr(m[1], { x }), evalExpr(m[2], { x }))) return numIs(x); throw new Error(`the lines do not cross at a whole x: ${p}`); },
  // ---------------------------------------------------------------------------------------------- Shape & Measure
  triangleArea(p) { const [b, h] = nums(p); return numIs(b * h / 2); },
  volumeFrac(p) { const m = need(/is (\d+ 1\/2) m long, (\d+) m wide and (\d+) m high/.exec(p), p); return numIs(numOf(m[1]) * +m[2] * +m[3]); },
  trapezoidArea(p) { const [a, b, h] = nums(p); return numIs(a * h + (b - a) * h / 2); }, // the rectangle on the short side, plus the triangles
  compositeArea(p) { const m = need(/one is (\d+) m by (\d+) m and the other is (\d+) m by (\d+) m/.exec(p), p); return numIs(+m[1] * +m[2] + +m[3] * +m[4]); },
  surfaceAreaBox(p) { const [l, w, h] = nums(p); let total = 0; for (const [a, b] of [[l, w], [l, w], [l, h], [l, h], [w, h], [w, h]]) total += a * b; return numIs(total); },
  cubeSurface(p) { const [e] = nums(p); let total = 0; for (let f = 0; f < 6; f++) total += e * e; return numIs(total); },
  coordRectArea(p) { const ps = points(p); let twice = 0; ps.forEach((a, i) => { const b = ps[(i + 1) % ps.length]; twice += a[0] * b[1] - b[0] * a[1]; }); return numIs(Math.abs(twice) / 2); },
  halfCubes(p) { const m = need(/is (\d+) cm long, (\d+) cm wide and (\d+) cm high/.exec(p), p); return numIs((+m[1] * 2) * (+m[2] * 2) * (+m[3] * 2)); },
  scaleMap(p) { const m = need(/1 cm to (\d+) m\. Two towers are (\d+) cm apart/.exec(p), p); let d = 0; for (let k = 0; k < +m[2]; k++) d += +m[1]; return numIs(d); },
  scaleFactorLength(p) { const m = need(/scale factor of (\d+)\. A side that was (\d+) cm/.exec(p), p); return numIs(+m[1] * +m[2]); },
  scaleArea(p) { const k = +need(/scale factor of (\d+)/.exec(p), p)[1]; return numIs((2 * k) * (3 * k) / (2 * 3)); }, // a 2 by 3 rectangle, before and after
  scaleToPlan(p) { const m = need(/1 cm stands for (\d+) m\. A hall is really (\d+) m long/.exec(p), p); return numIs(+m[2] / +m[1]); },
  angle(p) { const a = +need(/One angle is (\d+)°/.exec(p), p)[1]; return numIs(180 - a); },
  verticalAngles(p) { const a = +need(/One of the four angles is (\d+)°/.exec(p), p)[1]; return numIs(/next to it/.test(p) ? 180 - a : a); },
  angleRatio(p) { const m = need(/they add to (\d+)°\. One angle is (\d+) times the other/.exec(p), p); for (let s = 1; s < +m[1]; s++) if (s + s * +m[2] === +m[1]) return numIs(s); throw new Error(`no whole angle: ${p}`); },
  prismVolume(p) { const m = need(/is (\d+) cm wide and (\d+) cm tall, and the prism is (\d+) cm long/.exec(p), p); return numIs(+m[1] * +m[2] / 2 * +m[3]); },
  pythagHyp(p) { const m = need(/legs of (\d+) cm and (\d+) cm/.exec(p), p); for (let c = 1; c < 200; c++) if (c * c === +m[1] * +m[1] + +m[2] * +m[2]) return numIs(c); throw new Error(`no whole side: ${p}`); },
  pythagLeg(p) { const m = need(/ladder (\d+) m long leans against a wall\. Its foot is (\d+) m/.exec(p), p); for (let u = 1; u < +m[1]; u++) if (u * u + +m[2] * +m[2] === +m[1] * +m[1]) return numIs(u); throw new Error(`no whole height: ${p}`); },
  reflectPoint(p) { const [[x, y]] = points(p), want = /across the x-axis/.test(p) ? [x, -y] : [-x, y]; return v => { const q = points(v)[0]; return !!q && eq(q[0], want[0]) && eq(q[1], want[1]); }; },
  translatePoint(p) {
    const [[x, y]] = points(p), m = need(/slides (\d+) units? (left|right) and (\d+) units? (up|down)/.exec(p), p);
    const want = [x + (m[2] === 'left' ? -1 : 1) * +m[1], y + (m[4] === 'down' ? -1 : 1) * +m[3]];
    return v => { const q = points(v)[0]; return !!q && eq(q[0], want[0]) && eq(q[1], want[1]); };
  },
  dilatePoint(p) { const [[x, y]] = points(p), k = +need(/scale factor of (\d+)/.exec(p), p)[1]; return v => { const q = points(v)[0]; return !!q && eq(q[0], k * x) && eq(q[1], k * y); }; },
  // ---------------------------------------------------------------------------------------------- Data & Chance
  // A second, separately written key: the statistical question is the one about a whole group, whose answers vary.
  statQuestion() { return v => /each student in the class|are the sunflowers in the school garden|do the grade 6 students take|in each game of a season|do the students in grade 7 sleep/.test(String(v)); },
  meanFive(p) { const v = listed(p, 'plants are ', ' cm tall'); return numIs(v.reduce((s, x) => s + x, 0) / v.length); },
  rangeCalc(p) { const v = listed(p, 'run times: ', ' seconds'); return numIs(Math.max(...v) - Math.min(...v)); },
  moreConsistent(p) {
    const A = listed(p, 'Team A jumped ', ' cm\\. Team B'), B = listed(p, 'Team B jumped ', ' cm\\. Both');
    const spread = v => { const m = v.reduce((s, x) => s + x, 0) / v.length; return v.reduce((s, x) => s + Math.abs(x - m), 0) / v.length; };
    if (eq(spread(A), spread(B))) throw new Error(`equal spreads: ${p}`);
    return v => v === (spread(A) < spread(B) ? 'Team A' : 'Team B');
  },
  medianCalc(p) { return numIs(median(listed(p, 'median of ', '\\?'))); },
  medianEven(p) { return numIs(median(listed(p, 'median of ', '\\?'))); },
  iqrBox(p) { const m = need(/lower quartile (\d+), median \d+, upper quartile (\d+)/.exec(p), p); return numIs(+m[2] - +m[1]); },
  madCalc(p) { const v = listed(p, 'The values ', ' have a mean'), m = v.reduce((s, x) => s + x, 0) / v.length; if (!eq(m, +need(/mean of (\d+)/.exec(p), p)[1])) throw new Error(`the stated mean is wrong: ${p}`); return numIs(v.reduce((s, x) => s + Math.abs(x - m), 0) / v.length); },
  sampleScale(p) { const m = need(/sample of (\d+) students: (\d+) of them walk to school\. The school has (\d+) students/.exec(p), p); return numIs(+m[2] / +m[1] * +m[3]); },
  randomSample() { return v => /picked at random from the list of all students/.test(String(v)); },
  meansInMads(p) { const m = need(/is (\d+) cm and Team B's is (\d+) cm\. For both teams the mean absolute deviation is (\d+) cm/.exec(p), p); return numIs(Math.abs(+m[2] - +m[1]) / +m[3]); },
  compareMedians(p) {
    const a = median(listed(p, "Class A's quiz scores are ", "\\. Class B's")), b = median(listed(p, "Class B's quiz scores are ", '\\. Which'));
    return v => { const m = /^Class ([AB]), by (\d+)$/.exec(String(v)); return m ? (m[1] === 'A' ? a - b : b - a) === +m[2] && +m[2] > 0 : a === b && /same/.test(String(v)); };
  },
  probSimple(p) { const m = need(/holds (\d+) red, (\d+) blue and (\d+) green tiles?\..*probability that it is (red|blue|green)\?/.exec(p), p); const c = { red: +m[1], blue: +m[2], green: +m[3] }; return numIs(c[m[4]] / (c.red + c.blue + c.green)); },
  expectedCount(p) { const m = need(/probability (\d+)\/(\d+)\. In (\d+) spins/.exec(p), p); return numIs(+m[3] / +m[2] * +m[1]); },
  complementProb(p) { const [x] = nums(p); return numIs((10 - Math.round(x * 10)) / 10); },
  sampleSpace(p) { const first = /coin is flipped/.test(p) ? ['H', 'T'] : [1, 2, 3, 4, 5, 6], k = +need(/spinner with (\d+) equal parts/.exec(p), p)[1]; const all = new Set(); for (const a of first) for (let s = 1; s <= k; s++) all.add(`${a}-${s}`); return numIs(all.size); },
  scatterAssociation(p) {
    const want = /rise from left to right/.test(p) ? /^A positive linear/ : /fall from left to right/.test(p) ? /^A negative linear/ : /scattered with no pattern/.test(p) ? /^No association/ : /along a curve/.test(p) ? /^A nonlinear/ : null;
    if (!want) throw new Error(`unknown picture: ${p}`);
    return v => want.test(String(v));
  },
  trendPredict(p) { const m = need(/is (y = .+?), where x.*predict for \w+ (\d+)\?/.exec(p), p); return numIs(evalExpr(m[1], { x: +m[2] })); },
  trendSlopeMeaning(p) {
    const m = need(/is (y = .+?), where x is the number of (\w+)s .*What does the (\d+) tell you\?/.exec(p), p);
    const rate = evalExpr(m[1], { x: 1 }) - evalExpr(m[1], { x: 0 });
    if (!eq(rate, +m[3])) throw new Error(`the number asked about is not the rate: ${p}`);
    return v => new RegExp(`goes up about ${rate} \\w+ each ${m[2]}$`).test(String(v));
  },
  scatterOutlier(p) {
    const ps = points(p), line = q => q.every(a => eq((a[1] - q[0][1]) * (q[1][0] - q[0][0]), (q[1][1] - q[0][1]) * (a[0] - q[0][0])));
    const odd = ps.filter((_, i) => line(ps.filter((__, j) => j !== i)));
    if (odd.length !== 1) throw new Error(`not exactly one outlier: ${p}`);
    return v => { const q = points(v)[0]; return !!q && q[0] === odd[0][0] && q[1] === odd[0][1]; };
  },
};
