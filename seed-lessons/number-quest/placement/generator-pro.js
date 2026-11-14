// Number Quest placement: the item archetypes for rungs 6.0-8.0 (grades 6-8), added with the Pro lock
// of 2026-11-14. generator.js merges these into its ARCHETYPES table; nothing below rung 6 uses one, and
// no archetype in generator.js was changed, so every item below rung 6 is dealt exactly as before.
//
// Same contract as generator.js: (rng, gen, context, strand) -> { prompt, answer, distractors: [3 of
// { value, misconception }] }. generateItem re-rolls when two choices print the same, shuffles, and
// serves buttons whenever the answer is not a whole number from 0 to 99 (nobody types "−7" or "3/4").
//
// House rules for these archetypes:
// - A negative number is written with the true minus sign (U+2212) and is a STRING ("−7"), in the
//   prompt and in the choices. A positive whole number is a number. (generateItem swaps a numeric
//   wrong answer of 0 or less for a near miss when the key is positive; a string is left alone, which
//   is what an item about negative numbers needs.) No wrong answer here is a bare 0.
// - A fraction is a reduced string ("3/4"); a decimal is a number.
// - Every wrong answer is what a named mistake produces from the item's own numbers.
// - Contexts are neutral: science, maps, sport, measurement. Nothing is bought, sold or priced.
// - Each prompt has one fixed sentence shape, because tests/unit/number-quest-placement-pro.test.js
//   reads the numbers back out of the prompt and solves the item independently.

const ri = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pickOne = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const shuffled = (rng, arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const MINUS = '−';
const r2 = n => Math.round(n * 100) / 100;
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
/** A number as it is printed in a sentence: always a string, the true minus sign for a negative. */
export const tx = n => { const r = r2(n); return r < 0 ? `${MINUS}${-r}` : String(Object.is(r, -0) ? 0 : r); };
/** A number as a choice: a positive number stays a number, a negative one is its printed string. */
export const val = n => { const r = r2(n); return r < 0 ? tx(r) : (Object.is(r, -0) ? 0 : r); };
/** n/d as a choice: a whole number when it divides, else the reduced fraction as a string ("3/4", "−1/2"). */
export const fr = (n, d) => {
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d); n /= g; d /= g;
  return d === 1 ? val(n) : `${n < 0 ? MINUS : ''}${Math.abs(n)}/${d}`;
};
/** n/d as a mixed number in a sentence: "4 1/2", "3", "3/4". */
export const mixed = (n, d) => { const g = gcd(n, d); n /= g; d /= g; const w = Math.floor(n / d), r = n % d; return r === 0 ? String(w) : w === 0 ? `${r}/${d}` : `${w} ${r}/${d}`; };
const pt = (x, y) => `(${tx(x)}, ${tx(y)})`;
const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = n => [...String(n)].map(c => SUPS[+c]).join('');
/** y = mx + b as it is printed: "y = 2x + 1", "y = −x + 7", "y = 3x − 2", "y = 4x". */
export const lineEq = (m, b) => `y = ${m === 1 ? '' : m === -1 ? MINUS : tx(m)}x${b === 0 ? '' : b > 0 ? ` + ${b}` : ` ${MINUS} ${-b}`}`;
const list = a => `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
const d3 = (...pairs) => pairs.map(([value, misconception]) => ({ value, misconception }));
/** The first three candidates that differ from the key and from each other, and are not a bare number of 0 or
 *  less (see the house rules). An archetype lists its mistakes in order of interest; a spare covers a collision. */
function take3(answer, cands) {
  const seen = new Set([String(answer)]), out = [];
  for (const [value, misconception] of cands) {
    if (seen.has(String(value)) || (typeof value === 'number' && !(value > 0))) continue;
    seen.add(String(value)); out.push({ value, misconception });
    if (out.length === 3) break;
  }
  // Too many collisions for these numbers (rare): hand back a copy of the key, which generateItem reads as "two
  // choices print the same" and answers by dealing the item again with fresh numbers.
  return out.length === 3 ? out : [...out, { value: answer, misconception: 'deal-again' }];
}

export const PRO_ARCHETYPES = {
  // ------------------------------------------------------------------------------------------ Number 6.0
  /** 6.NS.A: how many fraction-sized jars fill from a total. */
  fracDivide(rng) {
    const [a, b] = pickOne(rng, [[1, 2], [1, 4], [3, 4], [2, 3], [1, 3], [3, 8], [2, 5]]), q = ri(rng, 2, 9);
    const total = mixed(q * a, b);
    return { prompt: `Each jar holds ${a}/${b} of a liter. How many jars can be filled from ${total} ${total === '1' ? 'liter' : 'liters'} of juice?`, answer: q,
      distractors: take3(q, [[fr(q * a * a, b * b), 'multiplied-instead-of-dividing'], [fr(1, q), 'divided-the-wrong-way-round'], [fr(q * a, b), 'gave-the-total-amount'], [q + 1, 'counted-a-jar-that-is-not-full']]) };
  },
  /** 6.NS.C: order negative numbers (the coldest, or the greatest). */
  signedOrder(rng, g) {
    const pool = shuffled(rng, [-1, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12]).slice(0, 4), s = [...pool].sort((x, y) => x - y);
    if (g.ask === 'coldest') {
      return { prompt: `Which temperature is the coldest: ${list(pool.map(n => `${tx(n)}°C`))}?`, answer: `${tx(s[0])}°C`,
        distractors: d3([`${tx(s[3])}°C`, 'picked-the-number-nearest-zero-as-the-least'], [`${tx(s[2])}°C`, 'ordered-the-negative-numbers-backwards'], [`${tx(s[1])}°C`, 'missed-the-least-by-one-place']) };
    }
    return { prompt: `Which number is the greatest: ${list(pool.map(tx))}?`, answer: tx(s[3]),
      distractors: d3([tx(s[0]), 'bigger-absolute-value-means-bigger-number'], [tx(s[1]), 'ordered-the-negative-numbers-backwards'], [tx(s[2]), 'missed-the-greatest-by-one-place']) };
  },
  /** 6.NS.C: absolute value as distance from zero. */
  farthestFromZero(rng) {
    const mags = shuffled(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).slice(0, 4).sort((x, y) => y - x); // biggest first
    const nums = [-mags[0], mags[1], -mags[3], mags[2]]; // the farthest is negative; the greatest number is mags[1]
    const shown = shuffled(rng, nums);
    return { prompt: `Which number is farthest from zero on a number line: ${list(shown.map(tx))}?`, answer: tx(nums[0]),
      distractors: d3([mags[1], 'picked-the-greatest-number-not-the-farthest'], [tx(-mags[3]), 'picked-the-number-nearest-zero'], [mags[2], 'ignored-the-negative-numbers']) };
  },
  /** 6.NS.C: the opposite of a number. */
  oppositeOf(rng) {
    const n = ri(rng, 2, 15) * (rng() < 0.6 ? -1 : 1);
    return { prompt: `What number is the opposite of ${tx(n)}?`, answer: val(-n),
      distractors: d3([val(n), 'copied-the-number'], [fr(1, n), 'gave-the-reciprocal'], [val(-2 * n), 'doubled-the-distance-from-zero']) };
  },
  // ------------------------------------------------------------------------------------------ Number 6.5
  /** 6.NS.B: multiply decimals. */
  decimalMul(rng) {
    const i = ri(rng, 2, 9), j = ri(rng, 3, 9), ans = (i * j) / 100;
    return { prompt: `What is ${i / 10} × ${j / 10}?`, answer: ans,
      distractors: d3([(i * j) / 10, 'one-decimal-place-short'], [i * j, 'ignored-the-decimal-points'], [(i + j) / 10, 'added-instead-of-multiplying']) };
  },
  /** 6.NS.B: divide by a decimal. */
  decimalDiv(rng) {
    const dv = pickOne(rng, [2, 3, 4, 5, 6, 8]), q = ri(rng, 2, 9), dividend = (q * dv) / 10;
    return { prompt: `What is ${dividend} ÷ ${dv / 10}?`, answer: q,
      distractors: take3(q, [[q / 10, 'decimal-point-slip'], [r2(dividend * dv / 10), 'multiplied-instead-of-dividing'], [q * 10, 'decimal-point-slip-the-other-way']]) };
  },
  /** 6.NS.B: greatest common factor, or least common multiple. */
  gcfLcm(rng, g) {
    const f = pickOne(rng, [2, 3, 4, 5, 6]), [m, n] = pickOne(rng, [[2, 3], [3, 4], [2, 5], [3, 5], [4, 5], [2, 7], [3, 7]]);
    const a = f * m, b = f * n, lcm = f * m * n;
    if (g.ask === 'lcm') {
      return { prompt: `What is the least common multiple of ${a} and ${b}?`, answer: lcm,
        distractors: take3(lcm, [[a * b, 'multiplied-the-two-numbers'], [f, 'gave-the-greatest-common-factor'], [b, 'gave-one-of-the-numbers'], [lcm * 2, 'gave-a-common-multiple-that-is-not-the-least']]) };
    }
    const small = [2, 3].find(p => f % p === 0 && p < f) || 1;
    return { prompt: `What is the greatest common factor of ${a} and ${b}?`, answer: f,
      distractors: take3(f, [[lcm, 'gave-the-least-common-multiple'], [small, 'gave-a-common-factor-that-is-not-the-greatest'], [a, 'gave-one-of-the-numbers'], [b - a, 'subtracted-the-two-numbers']]) };
  },
  /** 6.NS.C: distance between a negative and a positive number. */
  lineDistance(rng) {
    let a, b; do { a = ri(rng, 2, 12); b = ri(rng, 2, 12); } while (a === b);
    return { prompt: `How far apart are ${tx(-a)} and ${b} on a number line?`, answer: a + b,
      distractors: take3(a + b, [[Math.abs(a - b), 'ignored-the-negative-sign'], [Math.max(a, b), 'measured-only-one-number-from-zero'], [a * b, 'multiplied-the-two-numbers'], [a + b + 1, 'counted-both-end-marks']]) };
  },
  // ------------------------------------------------------------------------------------------ Number 7.0
  /** 7.NS.A: add a negative and a positive number. */
  signedAdd(rng) {
    const a = ri(rng, 3, 15), b = ri(rng, 2, 18), ans = b - a;
    return { prompt: `What is ${tx(-a)} + ${b}?`, answer: val(ans),
      distractors: take3(val(ans), [[a + b, 'ignored-the-negative-sign'], [val(-ans), 'sign-rule-reversed'], [val(-a - b), 'subtracted-instead-of-adding'], [val(ans + 2), 'miscounted-on-the-number-line']]) };
  },
  /** 7.NS.A: subtract a negative number. */
  signedSub(rng) {
    let a, b; do { a = ri(rng, 1, 9) * (rng() < 0.5 ? -1 : 1); b = ri(rng, 2, 12); } while (a === b);
    const ans = a + b;
    return { prompt: `What is ${tx(a)} ${MINUS} (${tx(-b)})?`, answer: val(ans),
      distractors: take3(val(ans), [[val(a - b), 'ignored-the-double-negative'], [val(-ans), 'sign-rule-reversed'], [val(b - a), 'subtracted-the-wrong-way-round'], [val(ans + 1), 'miscounted-on-the-number-line']]) };
  },
  /** 7.NS.A: multiply with negative numbers. */
  signedMul(rng) {
    const a = ri(rng, 2, 9), b = ri(rng, 2, 9), both = rng() < 0.4, ans = both ? a * b : -a * b;
    return { prompt: `What is ${tx(-a)} × ${both ? `(${tx(-b)})` : b}?`, answer: val(ans),
      distractors: take3(val(ans), [[val(-ans), 'sign-rule-reversed'], [val(-a + (both ? -b : b)), 'added-instead-of-multiplying'], [val(ans + (ans < 0 ? -a : a)), 'one-group-too-many'], [val(ans + (ans < 0 ? a : -a)), 'one-group-too-few']]) };
  },
  /** 7.NS.A: a signed change in a real context. */
  signedStory(rng) {
    const s = -ri(rng, 3, 15); let up, down; do { up = ri(rng, 2, 9); down = ri(rng, 2, 12); } while (up === down);
    const ans = s + up - down;
    const prompt = rng() < 0.5
      ? `A diver is at ${tx(s)} meters. She rises ${up} meters and then sinks ${down} meters. What is her position now, in meters?`
      : `The temperature is ${tx(s)}°C. It rises ${up}° and then falls ${down}°. What is the temperature now, in °C?`;
    return { prompt, answer: val(ans),
      distractors: take3(val(ans), [[val(s - up + down), 'reversed-the-two-directions'], [val(s - up - down), 'treated-both-changes-as-going-down'], [val(up - down), 'ignored-the-starting-point'], [val(-ans), 'dropped-the-negative-sign']]) };
  },
  // ------------------------------------------------------------------------------------------ Number 7.5
  /** 7.NS.A: divide with negative numbers. */
  signedDiv(rng) {
    const b = ri(rng, 2, 9), q = ri(rng, 2, 12), both = rng() < 0.4, ans = both ? q : -q;
    return { prompt: `What is ${tx(-b * q)} ÷ ${both ? `(${tx(-b)})` : b}?`, answer: val(ans),
      distractors: take3(val(ans), [[val(-ans), 'sign-rule-reversed'], [val(-b * q - (both ? -b : b)), 'subtracted-instead-of-dividing'], [val(ans + (ans < 0 ? -1 : 1)), 'slipped-on-the-division-fact'], [val(-b * q), 'gave-the-number-being-divided']]) };
  },
  /** 7.NS.A: a fraction as a decimal. */
  fracToDecimal(rng) {
    const [n, d] = pickOne(rng, [[1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 8], [3, 8], [5, 8], [7, 8], [1, 20], [3, 20], [7, 20], [9, 20], [1, 25], [3, 25], [6, 25]]);
    const ans = n / d;
    return { prompt: `Write ${n}/${d} as a decimal.`, answer: ans,
      distractors: take3(ans, [[Number(`${n}.${d}`), 'wrote-the-two-numbers-around-a-point'], [r2(d / n), 'divided-the-wrong-way-round'], [r2(ans * 10), 'decimal-point-slip'], [Number(`0.${n}${d}`), 'wrote-the-digits-after-a-point']]) };
  },
  /** 7.NS.A / 7.EE.B: order of operations with a negative decimal. */
  rationalMix(rng) {
    const a = -(ri(rng, 0, 4) + 0.5), b = pickOne(rng, [2, 4, 6]), c = ri(rng, 1, 9), ans = a * b + c;
    return { prompt: `What is ${tx(a)} × ${b} + ${c}?`, answer: val(ans),
      distractors: take3(val(ans), [[val(a * (b + c)), 'did-the-addition-first'], [val(-a * b + c), 'dropped-the-negative-sign'], [val(a * b - c), 'subtracted-instead-of-adding'], [val(a + b + c), 'added-everything']]) };
  },
  /** 7.EE.B: a multi-step problem with a decimal rate. */
  tankRate(rng) {
    let start, rate, hours, lost;
    do { start = pickOne(rng, [30, 40, 50, 60, 80]); rate = ri(rng, 0, 4) + 0.5; hours = pickOne(rng, [2, 4, 6, 8]); lost = rate * hours; } while (start - lost < 5 || start - lost === lost);
    const ans = start - lost;
    return { prompt: `A tank holds ${start} liters of water. It loses ${rate} liters every hour. How many liters are left after ${hours} hours?`, answer: ans,
      distractors: take3(ans, [[lost, 'gave-the-amount-lost'], [start - rate, 'took-away-one-hour-only'], [start + lost, 'added-instead-of-subtracting'], [ans + rate, 'stopped-one-hour-early']]) };
  },
  // ------------------------------------------------------------------------------------------ Number 8.0
  /** 8.EE.A: the square root of a perfect square. */
  sqrtPerfect(rng) {
    const n = ri(rng, 4, 12), sq = n * n;
    return { prompt: `What is √${sq}?`, answer: n,
      distractors: take3(n, [[sq / 2, 'halved-the-number'], [sq * 2, 'doubled-the-number'], [sq * sq, 'squared-instead-of-finding-the-root'], [n + 1, 'slipped-on-the-square-fact']]) };
  },
  /** 8.EE.A: the cube root of a perfect cube. */
  cubeRoot(rng) {
    const n = ri(rng, 2, 6), c = n ** 3, root = Math.round(Math.sqrt(c));
    return { prompt: `What is the cube root of ${c}?`, answer: n,
      distractors: take3(n, [root * root === c ? [root, 'found-the-square-root'] : [c / 2, 'halved-the-number'], [Math.round(c / 3 * 10) / 10, 'divided-by-three'], [c * 3, 'multiplied-by-three'], [n * n, 'squared-the-answer']]) };
  },
  /** 8.NS.A: a square root that is not a whole number, placed between two whole numbers. */
  sqrtBetween(rng) {
    let n; do { n = ri(rng, 12, 99); } while (Number.isInteger(Math.sqrt(n)));
    const a = Math.floor(Math.sqrt(n)), h = Math.floor(n / 2), pair = x => `${x} and ${x + 1}`;
    return { prompt: `√${n} is between which two whole numbers?`, answer: pair(a),
      distractors: take3(pair(a), [[pair(a - 1), 'one-step-too-low'], [pair(a + 1), 'one-step-too-high'], [pair(h), 'halved-the-number'], [pair(n - 1), 'thought-the-root-is-about-the-number']]) };
  },
  /** 8.EE.A: the product rule for whole-number exponents. */
  expLaw(rng) {
    const b = pickOne(rng, [2, 3, 5, 10]); let m, n;
    do { m = ri(rng, 2, 5); n = ri(rng, 2, 6); } while (m * n === m + n);
    const p = (base, e) => `${base}${sup(e)}`;
    return { prompt: `Which is equal to ${p(b, m)} × ${p(b, n)}?`, answer: p(b, m + n),
      distractors: d3([p(b, m * n), 'multiplied-the-exponents'], [p(b * b, m + n), 'multiplied-the-bases-too'], [p(b * b, m * n), 'multiplied-the-bases-and-the-exponents']) };
  },

  // ------------------------------------------------------------------------------------------ Algebra 6.0
  /** 6.RP.A: a unit rate, in a neutral context. */
  rateNeutral(rng) {
    const [start, unit, per, one, verb] = pickOne(rng, [['A pump fills', 'liters', 'minutes', 'minute', 'fill'], ['A printer prints', 'pages', 'minutes', 'minute', 'print'], ['A conveyor moves', 'boxes', 'minutes', 'minute', 'move'], ['A machine fills', 'bottles', 'minutes', 'minute', 'fill']]);
    let rate, k; do { rate = ri(rng, 3, 12); k = ri(rng, 2, 8); } while (rate === k);
    const total = rate * k;
    return { prompt: `${start} ${total} ${unit} in ${k} ${per} at a steady rate. How many ${unit} does it ${verb} in 1 ${one}?`, answer: rate,
      distractors: take3(rate, [[total, 'gave-the-total'], [k, 'gave-the-time'], [total - k, 'subtracted-instead-of-dividing'], [rate + 1, 'slipped-on-the-division-fact']]) };
  },
  /** 6.RP.A: a missing value in a ratio table. */
  ratioTable(rng) {
    const a = ri(rng, 2, 6), xs = shuffled(rng, [2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3).sort((x, y) => x - y), ans = a * xs[2];
    return { prompt: `In a ratio table, ${xs[0]} goes with ${a * xs[0]} and ${xs[1]} goes with ${a * xs[1]}. What goes with ${xs[2]}?`, answer: ans,
      distractors: take3(ans, [[a * xs[1] + (xs[2] - xs[1]), 'added-the-difference-instead-of-scaling'], [xs[2] + (a - 1) * xs[0], 'added-the-first-gap-instead-of-multiplying'], [ans + a, 'one-group-too-many'], [a * xs[1], 'repeated-the-last-entry']]) };
  },
  // ------------------------------------------------------------------------------------------ Algebra 6.5
  /** 6.EE.A: write an expression from words. */
  exprWrite(rng) {
    let a, b; do { a = ri(rng, 2, 9); b = ri(rng, 2, 9); } while (a === b);
    if (rng() < 0.5) {
      return { prompt: `Which expression means "${b} more than ${a} times n"?`, answer: `${a}n + ${b}`,
        distractors: d3([`${b}n + ${a}`, 'swapped-the-two-numbers'], [`${a}(n + ${b})`, 'grouped-the-wrong-way'], [`n + ${a + b}`, 'added-everything']) };
    }
    return { prompt: `Which expression means "${b} less than ${a} times n"?`, answer: `${a}n ${MINUS} ${b}`,
      distractors: d3([`${b} ${MINUS} ${a}n`, 'subtracted-the-wrong-way-round'], [`${a}(n ${MINUS} ${b})`, 'grouped-the-wrong-way'], [`${b}n ${MINUS} ${a}`, 'swapped-the-two-numbers']) };
  },
  /** 6.EE.B: which value makes an inequality true. */
  inequalityTruth(rng) {
    const b = ri(rng, 2, 8), c = ri(rng, b + 6, b + 14), t = c - b; // t is the boundary: 6 or more
    if (rng() < 0.5) {
      return { prompt: `Which value of x makes x + ${b} > ${c} true?`, answer: t + ri(rng, 1, 3),
        distractors: d3([t, 'counted-the-boundary-value'], [t - ri(rng, 1, 2), 'picked-a-value-on-the-wrong-side'], [t - ri(rng, 3, 5), 'picked-a-value-far-on-the-wrong-side']) };
    }
    return { prompt: `Which value of x makes x + ${b} < ${c} true?`, answer: t - ri(rng, 1, 3),
      distractors: d3([t, 'counted-the-boundary-value'], [t + ri(rng, 1, 2), 'picked-a-value-on-the-wrong-side'], [t + ri(rng, 3, 5), 'picked-a-value-far-on-the-wrong-side']) };
  },
  // ------------------------------------------------------------------------------------------ Algebra 7.0
  /** 7.RP.A: the constant of proportionality from a table. */
  constantK(rng) {
    const k = pickOne(rng, [0.5, 1.5, 2.5, 3, 3.5, 4, 6]), xs = [2, 4, 6], ys = xs.map(x => k * x);
    return { prompt: `y is proportional to x. When x is ${list(xs)}, y is ${list(ys)}. What is the constant of proportionality, y ÷ x?`, answer: k,
      distractors: take3(k, [[r2(1 / k), 'divided-x-by-y'], [val(ys[0] - xs[0]), 'subtracted-instead-of-dividing'], [ys[1] - ys[0], 'gave-the-step-in-y'], [ys[0], 'gave-the-first-y-value']]) };
  },
  /** 7.RP.A: recognise a proportional relationship. */
  isProportional(rng) {
    const k = ri(rng, 2, 6), c = ri(rng, 2, 5), m = ri(rng, 2, 4), j = ri(rng, 2, 5), e = ri(rng, 1, 4);
    const pairs = f => [1, 2, 3].map(x => `(${x}, ${f(x)})`).join(', ');
    return { prompt: 'Which set of (x, y) pairs shows a proportional relationship?', answer: pairs(x => k * x),
      distractors: d3([pairs(x => x + c), 'same-amount-added-read-as-proportional'], [pairs(x => m * 2 ** (x - 1)), 'doubling-read-as-a-constant-ratio'], [pairs(x => j * x + e), 'a-line-that-misses-the-origin-read-as-proportional']) };
  },
  /** 7.RP.A: percent change, in a neutral context. */
  percentChange(rng) {
    let old, pct, change; do { old = pickOne(rng, [40, 50, 60, 80, 120, 200]); pct = pickOne(rng, [10, 20, 25, 30, 40, 75]); change = old * pct / 100; } while (!Number.isInteger(change));
    if (rng() < 0.5) {
      const now = old - change;
      return { prompt: `A water tank held ${old} liters. Now it holds ${now} liters. By what percent did the amount go down?`, answer: pct,
        distractors: take3(pct, [[change, 'gave-the-change-not-the-percent'], [100 - pct, 'gave-the-percent-that-is-left'], [Math.round(change / now * 100), 'divided-by-the-new-amount'], [pct + 5, 'estimated-the-percent']]) };
    }
    const now = old + change;
    return { prompt: `A plant was ${old} cm tall. Now it is ${now} cm tall. By what percent did its height go up?`, answer: pct,
      distractors: take3(pct, [[change, 'gave-the-change-not-the-percent'], [100 + pct, 'gave-the-new-height-as-a-percent-of-the-old'], [Math.round(change / now * 100), 'divided-by-the-new-amount'], [pct + 5, 'estimated-the-percent']]) };
  },
  // ------------------------------------------------------------------------------------------ Algebra 7.5
  /** 7.EE.A: the distributive property. */
  distribute(rng) {
    let a, b; do { a = ri(rng, 2, 9); b = ri(rng, 2, 9); } while (a + b === a * b);
    if (rng() < 0.5) {
      return { prompt: `Which expression is equal to ${a}(x + ${b})?`, answer: `${a}x + ${a * b}`,
        distractors: d3([`${a}x + ${b}`, 'multiplied-only-the-first-term'], [`x + ${a * b}`, 'multiplied-only-the-second-term'], [`${a}x + ${a + b}`, 'added-instead-of-multiplying']) };
    }
    return { prompt: `Which expression is equal to ${a}(x ${MINUS} ${b})?`, answer: `${a}x ${MINUS} ${a * b}`,
      distractors: d3([`${a}x ${MINUS} ${b}`, 'multiplied-only-the-first-term'], [`x ${MINUS} ${a * b}`, 'multiplied-only-the-second-term'], [`${a}x + ${a * b}`, 'lost-the-minus-sign']) };
  },
  /** 7.EE.A: combine like terms. */
  combineLike(rng) {
    let a, c; do { a = ri(rng, 2, 7); c = ri(rng, 2, 7); } while (a * c === a + c);
    const b = ri(rng, 3, 9), d = ri(rng, 1, b - 1);
    return { prompt: `Which expression is equal to ${a}x + ${b} + ${c}x ${MINUS} ${d}?`, answer: `${a + c}x + ${b - d}`,
      distractors: d3([`${a + c + b - d}x`, 'combined-unlike-terms'], [`${a + c}x + ${b + d}`, 'ignored-the-minus-sign'], [`${a * c}x + ${b - d}`, 'multiplied-the-x-terms']) };
  },
  /** 7.EE.B: a two-step equation with a negative coefficient. */
  twoStepNeg(rng) {
    const a = ri(rng, 2, 6), m = ri(rng, 1, 5); let x; do { x = ri(rng, -6, 9); } while (x === 0 || x === m || Math.abs(x) === 1);
    const b = a * m, c = -a * x + b;
    return { prompt: `Solve: ${tx(-a)}x + ${b} = ${tx(c)}. What is x?`, answer: val(x),
      distractors: take3(val(x), [[val(x - 2 * m), 'added-instead-of-subtracting'], [val(-x), 'lost-the-negative-sign'], [val(c - b), 'stopped-before-dividing'], [val(x + 1), 'slipped-on-the-division-fact']]) };
  },
  // ------------------------------------------------------------------------------------------ Algebra 8.0
  /** 8.EE.B: the slope of a line through two points. */
  slopeTwoPoints(rng) {
    const [rise, run] = pickOne(rng, [[4, 2], [6, 2], [6, 3], [8, 2], [9, 3], [12, 4], [-4, 2], [-6, 2], [-6, 3], [-9, 3], [1, 2], [3, 2], [-3, 2], [3, 4], [-1, 2]]);
    const x1 = ri(rng, -3, 3), y1 = ri(rng, -4, 4);
    const ans = fr(rise, run);
    return { prompt: `A line passes through ${pt(x1, y1)} and ${pt(x1 + run, y1 + rise)}. What is its slope?`, answer: ans,
      distractors: take3(ans, [[fr(run, rise), 'divided-run-by-rise'], [fr(-rise, run), 'lost-the-sign-of-the-slope'], [val(rise), 'gave-the-rise-only'], [fr(rise, run + 1), 'miscounted-the-run']]) };
  },
  /** 8.F.B: an equation from a table. */
  lineFromTable(rng) {
    let m, b; do { m = ri(rng, 2, 6); b = ri(rng, 1, 9); } while (m === b);
    return { prompt: `A table shows x = 0, 1, 2, 3 and y = ${[0, 1, 2, 3].map(x => m * x + b).join(', ')}. Which equation fits the table?`, answer: lineEq(m, b),
      distractors: d3([lineEq(b, m), 'swapped-the-rate-and-the-starting-value'], [lineEq(m, 0), 'left-out-the-starting-value'], [lineEq(1, b), 'used-a-rate-of-one']) };
  },
  /** 8.EE.C: a linear equation with x on both sides. */
  linearSolve(rng) {
    const c = ri(rng, 1, 4), gap = ri(rng, 2, 4), a = c + gap, t = ri(rng, 1, 3), b = gap * t, x = ri(rng, 2, 9), d = gap * x + b;
    return { prompt: `Solve: ${a}x + ${b} = ${c === 1 ? '' : c}x + ${d}. What is x?`, answer: x,
      distractors: take3(x, [[x + 2 * t, 'added-the-constants-instead-of-subtracting'], [gap * x, 'stopped-before-dividing'], [a * x + b, 'gave-the-value-of-each-side'], [x + 1, 'slipped-on-the-division-fact']]) };
  },
  /** 8.EE.C: where two lines cross. */
  systemMeet(rng) {
    const m1 = ri(rng, 1, 4), m2 = -ri(rng, 1, 3), x = ri(rng, 1, 6), b1 = ri(rng, 1, 6), y = m1 * x + b1, b2 = y - m2 * x;
    return { prompt: `Line A is ${lineEq(m1, b1)}. Line B is ${lineEq(m2, b2)}. At what value of x do the two lines cross?`, answer: x,
      distractors: take3(x, [[y, 'gave-y-instead-of-x'], [b2 - b1, 'subtracted-the-constants-and-stopped'], [b2, 'gave-a-starting-value'], [b1 + b2, 'added-the-starting-values'], [x + 1, 'slipped-on-the-division-fact'], [x + 2, 'miscounted-along-the-line']]) };
  },

  // ------------------------------------------------------------------------------------------ Shape & Measure 6.0
  /** 6.G.A: area of a triangle. */
  triangleArea(rng) {
    let b, h; do { b = ri(rng, 4, 16); h = ri(rng, 3, 12); } while ((b * h) % 2 || b * h / 2 === b + h || b * h === 2 * (b + h));
    const ans = b * h / 2;
    return { prompt: `A triangle has a base of ${b} cm and a height of ${h} cm. What is its area, in square cm?`, answer: ans,
      distractors: take3(ans, [[b * h, 'forgot-to-halve'], [b + h, 'added-the-base-and-the-height'], [2 * (b + h), 'found-a-distance-around-instead'], [ans + b, 'added-an-extra-row']]) };
  },
  /** 6.G.A: volume of a box with a fractional edge. */
  volumeFrac(rng) {
    const k = ri(rng, 1, 4), w = pickOne(rng, [2, 4, 6]), h = ri(rng, 2, 5), ans = (2 * k + 1) * w * h / 2;
    return { prompt: `A box is ${k} 1/2 m long, ${w} m wide and ${h} m high. What is its volume, in cubic m?`, answer: ans,
      distractors: take3(ans, [[k * w * h, 'dropped-the-fraction'], [`${k + w + h} 1/2`, 'added-the-edges'], [(2 * k + 1) * w / 2, 'found-one-face-only'], [(k + 1) * w * h, 'rounded-the-fraction-up']]) };
  },
  /** 6.G.A: area of a trapezoid. */
  trapezoidArea(rng) {
    const a = ri(rng, 3, 9), b = a + 2 * ri(rng, 1, 4), h = ri(rng, 2, 8), ans = (a + b) / 2 * h;
    return { prompt: `A trapezoid has parallel sides of ${a} cm and ${b} cm. They are ${h} cm apart. What is its area, in square cm?`, answer: ans,
      distractors: take3(ans, [[(a + b) * h, 'forgot-to-halve'], [b * h, 'used-only-the-longer-side'], [a + b + h, 'added-everything'], [a * h, 'used-only-the-shorter-side']]) };
  },
  /** 6.G.A: area of a shape made of two rectangles. */
  compositeArea(rng) {
    const l1 = ri(rng, 5, 9), w1 = ri(rng, 3, 6), l2 = ri(rng, 2, 4), w2 = ri(rng, 2, 3), ans = l1 * w1 + l2 * w2;
    return { prompt: `A floor plan is made of two rectangles that do not overlap: one is ${l1} m by ${w1} m and the other is ${l2} m by ${w2} m. What is the total area, in square m?`, answer: ans,
      distractors: take3(ans, [[l1 * w1, 'counted-only-the-bigger-rectangle'], [(l1 + l2) * (w1 + w2), 'added-the-sides-before-multiplying'], [l1 + w1 + l2 + w2, 'added-all-the-side-lengths'], [l1 * w1 - l2 * w2, 'took-the-smaller-rectangle-away']]) };
  },
  // ------------------------------------------------------------------------------------------ Shape & Measure 6.5
  /** 6.G.A: surface area of a box. */
  surfaceAreaBox(rng) {
    const l = ri(rng, 3, 8), w = ri(rng, 2, 5), h = ri(rng, 2, 4), half = l * w + l * h + w * h, ans = 2 * half;
    return { prompt: `A closed box is ${l} cm long, ${w} cm wide and ${h} cm high. What is its total surface area, in square cm?`, answer: ans,
      distractors: take3(ans, [[l * w * h, 'found-the-volume'], [half, 'counted-three-faces-not-six'], [4 * (l + w + h), 'added-the-edges'], [2 * l * w, 'counted-only-the-top-and-bottom'], [l * w, 'found-one-face-only'], [2 * (l * w + l * h), 'left-out-one-pair-of-faces'], [ans + l * w, 'counted-one-face-too-many']]) };
  },
  /** 6.G.A: surface area of a cube. */
  cubeSurface(rng) {
    const e = pickOne(rng, [2, 3, 4, 5, 7, 8, 9, 10]), ans = 6 * e * e;
    return { prompt: `A cube has edges of ${e} cm. What is its total surface area, in square cm?`, answer: ans,
      distractors: take3(ans, [[e ** 3, 'found-the-volume'], [e * e, 'found-one-face-only'], [4 * e * e, 'counted-four-faces'], [12 * e, 'added-the-edges']]) };
  },
  /** 6.G.A / 6.NS.C: a rectangle on the coordinate plane. */
  coordRectArea(rng) {
    const x1 = -ri(rng, 1, 5), x2 = ri(rng, 1, 6), y1 = -ri(rng, 1, 4), y2 = ri(rng, 1, 5), w = x2 - x1, h = y2 - y1, ans = w * h;
    return { prompt: `A rectangle has corners at ${pt(x1, y2)}, ${pt(x2, y2)}, ${pt(x2, y1)} and ${pt(x1, y1)}. What is its area, in square units?`, answer: ans,
      distractors: take3(ans, [[Math.abs(x2 + x1) * Math.abs(y2 + y1), 'ignored-the-negative-signs'], [2 * (w + h), 'found-the-perimeter'], [w + h, 'added-the-two-side-lengths'], [x2 * y2, 'used-only-the-positive-corner'], [w * y2, 'measured-the-height-from-zero'], [x2 * h, 'measured-the-width-from-zero'], [ans + w, 'counted-one-row-too-many']]) };
  },
  /** 6.G.A: fill a box with half-unit cubes. */
  halfCubes(rng) {
    let l, w, h; do { l = ri(rng, 1, 3); w = ri(rng, 1, 3); h = ri(rng, 1, 2); } while (l * w * h > 12 || l * w * h < 2);
    const v = l * w * h;
    return { prompt: `How many cubes with edges of 1/2 cm are needed to fill a box that is ${l} cm long, ${w} cm wide and ${h} cm high?`, answer: 8 * v,
      distractors: d3([v, 'gave-the-volume-in-whole-cubes'], [2 * v, 'doubled-once-instead-of-in-every-direction'], [4 * v, 'doubled-in-two-directions-only']) };
  },
  // ------------------------------------------------------------------------------------------ Shape & Measure 7.0
  /** 7.G.A: a map scale. */
  scaleMap(rng) {
    const scale = pickOne(rng, [50, 100, 200, 250, 500]), d = ri(rng, 3, 9), ans = scale * d;
    return { prompt: `A map has a scale of 1 cm to ${scale} m. Two towers are ${d} cm apart on the map. How far apart are they really, in meters?`, answer: ans,
      distractors: take3(ans, [[scale + d, 'added-instead-of-multiplying'], [scale, 'gave-the-scale-only'], [Math.round(scale / d), 'divided-instead-of-multiplying'], [ans * 10, 'place-value-slip']]) };
  },
  /** 7.G.A: a length after scaling. */
  scaleFactorLength(rng) {
    const k = ri(rng, 2, 5), s = ri(rng, 4, 12), ans = k * s;
    return { prompt: `A drawing is enlarged by a scale factor of ${k}. A side that was ${s} cm long is now how long, in cm?`, answer: ans,
      distractors: take3(ans, [[s + k, 'added-the-scale-factor'], [s, 'left-the-length-unchanged'], [k * k * s, 'used-the-scale-factor-twice'], [ans + s, 'one-copy-too-many']]) };
  },
  /** 7.G.A: area after scaling. */
  scaleArea(rng) {
    const k = ri(rng, 3, 9), ans = k * k;
    return { prompt: `A rectangle is enlarged by a scale factor of ${k}. Its area becomes how many times as large?`, answer: ans,
      distractors: d3([k, 'used-the-length-factor-for-the-area'], [2 * k, 'doubled-the-scale-factor'], [k ** 3, 'cubed-the-scale-factor']) };
  },
  /** 7.G.A: from a real length back to the plan. */
  scaleToPlan(rng) {
    let s, p; do { s = pickOne(rng, [2, 4, 5, 10, 20]); p = ri(rng, 3, 9); } while (s === p);
    const real = s * p;
    return { prompt: `On a plan, 1 cm stands for ${s} m. A hall is really ${real} m long. How long is it on the plan, in cm?`, answer: p,
      distractors: take3(p, [[real * s, 'multiplied-instead-of-dividing'], [real - s, 'subtracted-the-scale'], [real + s, 'added-the-scale'], [s, 'gave-the-scale-only']]) };
  },
  // ------------------------------------------------------------------------------------------ Shape & Measure 7.5
  /** 7.G.B: the angles where two lines cross. */
  verticalAngles(rng, g) {
    let a; do { a = ri(rng, 25, 155); } while (Math.abs(a - 90) < 5);
    if (g.which === 'next') {
      return { prompt: `Two straight lines cross. One of the four angles is ${a}°. What is the angle next to it, in degrees?`, answer: 180 - a,
        distractors: take3(180 - a, [[a, 'copied-the-given-angle'], [Math.abs(90 - a), 'used-a-right-angle-total'], [360 - a, 'took-it-from-a-full-turn'], [190 - a, 'place-value-slip']]) };
    }
    return { prompt: `Two straight lines cross. One of the four angles is ${a}°. What is the angle directly opposite it, in degrees?`, answer: a,
      distractors: take3(a, [[180 - a, 'gave-the-angle-next-to-it'], [Math.abs(90 - a), 'used-a-right-angle-total'], [360 - a, 'took-it-from-a-full-turn'], [a + 10, 'place-value-slip']]) };
  },
  /** 7.G.B: two angles in a ratio, on a line or in a right angle. */
  angleRatio(rng) {
    const total = pickOne(rng, [90, 180]), k = pickOne(rng, total === 90 ? [2, 4, 5, 8, 9] : [2, 3, 4, 5, 8, 9]), ans = total / (k + 1);
    const frame = total === 90 ? 'Two angles make a right angle, so they add to 90°.' : 'Two angles make a straight line, so they add to 180°.';
    return { prompt: `${frame} One angle is ${k} times the other. What is the smaller angle, in degrees?`, answer: ans,
      distractors: take3(ans, [[total - ans, 'gave-the-larger-angle'], [total / k, 'divided-by-the-multiplier-only'], [total / 2, 'split-the-total-evenly'], [ans + k, 'added-the-multiplier']]) };
  },
  /** 7.G.B: volume of a triangular prism. */
  prismVolume(rng) {
    let b, h; do { b = ri(rng, 3, 8); h = ri(rng, 2, 6); } while ((b * h) % 2);
    const len = ri(rng, 3, 10), ans = b * h / 2 * len;
    return { prompt: `A prism has a triangle for its base. The triangle is ${b} cm wide and ${h} cm tall, and the prism is ${len} cm long. What is its volume, in cubic cm?`, answer: ans,
      distractors: take3(ans, [[b * h * len, 'forgot-to-halve-the-triangle'], [b + h + len, 'added-the-three-lengths'], [b * h / 2, 'found-the-triangle-only'], [ans + b * h / 2, 'one-layer-too-many']]) };
  },
  // ------------------------------------------------------------------------------------------ Shape & Measure 8.0
  /** 8.G.B: the longest side of a right triangle. */
  pythagHyp(rng) {
    const [a, b, c] = pickOne(rng, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [12, 16, 20], [7, 24, 25]]);
    const [p, q] = rng() < 0.5 ? [a, b] : [b, a];
    return { prompt: `A right triangle has legs of ${p} cm and ${q} cm. How long is its longest side, in cm?`, answer: c,
      distractors: take3(c, [[a + b, 'added-the-two-legs'], [c * c, 'forgot-the-square-root'], [a * b / 2, 'found-the-area'], [Math.max(a, b), 'gave-the-longer-leg']]) };
  },
  /** 8.G.B: a missing leg of a right triangle. */
  pythagLeg(rng) {
    const [a, b, c] = pickOne(rng, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [12, 16, 20], [7, 24, 25]]);
    const [foot, up] = rng() < 0.5 ? [a, b] : [b, a];
    return { prompt: `A ladder ${c} m long leans against a wall. Its foot is ${foot} m from the wall. How high up the wall does it reach, in m?`, answer: up,
      distractors: take3(up, [[c - foot, 'subtracted-the-two-lengths'], [c + foot, 'added-the-two-lengths'], [up * up, 'forgot-the-square-root'], [c, 'gave-the-length-of-the-ladder']]) };
  },
  /** 8.G.A: reflect a point across an axis. */
  reflectPoint(rng) {
    let x, y; do { x = ri(rng, 1, 7) * (rng() < 0.5 ? -1 : 1); y = ri(rng, 1, 7) * (rng() < 0.5 ? -1 : 1); } while (Math.abs(x) === Math.abs(y));
    const overX = rng() < 0.5;
    return { prompt: `Point P is at ${pt(x, y)}. It is reflected across the ${overX ? 'x' : 'y'}-axis. Where is its image?`, answer: overX ? pt(x, -y) : pt(-x, y),
      distractors: d3([overX ? pt(-x, y) : pt(x, -y), 'reflected-across-the-other-axis'], [pt(-x, -y), 'changed-both-signs'], [pt(y, x), 'swapped-the-coordinates']) };
  },
  /** 8.G.A: slide a point. */
  translatePoint(rng) {
    const x = ri(rng, -5, 5), y = ri(rng, -5, 5); let dx, dy; do { dx = ri(rng, 1, 6); dy = ri(rng, 1, 6); } while (dx === dy);
    const left = rng() < 0.5, down = rng() < 0.5, vx = left ? -dx : dx, vy = down ? -dy : dy;
    return { prompt: `Point P is at ${pt(x, y)}. It slides ${dx} units ${left ? 'left' : 'right'} and ${dy} units ${down ? 'down' : 'up'}. Where is its image?`, answer: pt(x + vx, y + vy),
      distractors: d3([pt(x - vx, y + vy), 'moved-the-wrong-way-across'], [pt(x + vx, y - vy), 'moved-the-wrong-way-up-or-down'], [pt(x + vy, y + vx), 'swapped-across-and-up']) };
  },
  /** 8.G.A: enlarge from the origin. */
  dilatePoint(rng) {
    let x, y, k;
    do { x = ri(rng, 1, 4) * (rng() < 0.5 ? -1 : 1); y = ri(rng, 1, 4) * (rng() < 0.5 ? -1 : 1); k = ri(rng, 2, 4); } while (x + k === k * x || y + k === k * y);
    return { prompt: `A corner of a shape is at ${pt(x, y)}. The shape is enlarged from the origin by a scale factor of ${k}. Where does that corner go?`, answer: pt(k * x, k * y),
      distractors: d3([pt(x + k, y + k), 'added-the-scale-factor'], [pt(k * x, y), 'scaled-only-the-first-coordinate'], [pt(x, k * y), 'scaled-only-the-second-coordinate']) };
  },

  // ------------------------------------------------------------------------------------------ Data & Chance 6.0
  /** 6.SP.A: what makes a question statistical. */
  statQuestion(rng) {
    const [topic, stat, one, fixed, word] = pickOne(rng, [
      ['books', 'How many books did each student in the class read last month?', 'How many books did Tally read last month?', 'How many pages are in this book?', 'Who wrote this book?'],
      ['sunflowers', 'How tall are the sunflowers in the school garden?', 'How tall is the tallest sunflower in the garden?', 'How many sunflowers are in the garden today?', 'What color is a sunflower?'],
      ['journeys to school', 'How long do the grade 6 students take to travel to school?', 'How long did Tally take to get to school today?', 'How far is the school from the library?', 'What time does the school day start?'],
      ['a soccer team', 'How many goals does the team score in each game of a season?', 'How many goals did the team score in its last game?', 'How many players are on the field for one team?', 'What is the name of the team?'],
      ['sleep', 'How many hours do the students in grade 7 sleep on a school night?', 'How many hours did Tally sleep last night?', 'How many hours are there in one day?', 'What time is midnight?'],
    ]);
    return { prompt: `Tally wants to collect data about ${topic}. A statistical question expects answers that vary. Which of these is a statistical question?`, answer: stat,
      distractors: d3([one, 'asked-about-one-value-not-a-group'], [fixed, 'picked-a-question-with-one-fixed-answer'], [word, 'picked-a-question-that-is-not-about-data']) };
  },
  /** 6.SP.A / 6.SP.B: the mean of five values. */
  meanFive(rng) {
    const m = ri(rng, 6, 15), devs = shuffled(rng, pickOne(rng, [[-4, -3, 1, 2, 4], [-3, -1, -1, 2, 3], [-4, -2, 1, 2, 3], [-2, -2, -1, 1, 4], [-3, -3, 2, 2, 2]]));
    const vals = devs.map(d => m + d), sorted = [...vals].sort((x, y) => x - y);
    return { prompt: `Five plants are ${list(vals)} cm tall. What is their mean height, in cm?`, answer: m,
      distractors: take3(m, [[sorted[2], 'gave-the-median'], [5 * m, 'forgot-to-divide'], [sorted[4], 'gave-the-largest-value'], [sorted[4] - sorted[0], 'gave-the-range']]) };
  },
  /** 6.SP.A: the range as a measure of spread. */
  rangeCalc(rng) {
    let vals; do { vals = shuffled(rng, Array.from({ length: 28 }, (_, i) => i + 3)).slice(0, 5); } while (Math.abs(vals[0] - vals[4]) === Math.max(...vals) - Math.min(...vals));
    const sorted = [...vals].sort((x, y) => x - y), ans = sorted[4] - sorted[0];
    return { prompt: `The times for five runs are ${list(vals)} seconds. What is the range of the times, in seconds?`, answer: ans,
      distractors: take3(ans, [[sorted[4], 'gave-the-largest-value'], [Math.abs(vals[0] - vals[4]), 'subtracted-the-first-and-last-without-ordering'], [sorted[2], 'gave-the-median'], [sorted[0], 'gave-the-smallest-value'], [sorted[4] + sorted[0], 'added-the-largest-and-the-smallest'], [sorted[3] - sorted[0], 'used-the-second-largest-value']]) };
  },
  /** 6.SP.A: the same center, a different spread. */
  moreConsistent(rng) {
    const m = ri(rng, 30, 60), tight = shuffled(rng, pickOne(rng, [[-1, 0, 0, 1], [-1, -1, 1, 1], [-2, 0, 1, 1]])), wide = shuffled(rng, pickOne(rng, [[-10, -5, 5, 10], [-8, -4, 4, 8], [-12, -6, 6, 12], [-9, -3, 3, 9]]));
    const aTight = rng() < 0.5, A = (aTight ? tight : wide).map(d => m + d), B = (aTight ? wide : tight).map(d => m + d);
    return { prompt: `Team A jumped ${list(A)} cm. Team B jumped ${list(B)} cm. Both teams have a mean of ${m} cm. Which team was more consistent?`, answer: aTight ? 'Team A' : 'Team B',
      distractors: d3([aTight ? 'Team B' : 'Team A', 'read-a-wider-spread-as-more-consistent'], ['They were equally consistent', 'used-the-mean-alone-to-judge-the-spread'], ['There is no way to tell', 'did-not-compare-the-spreads']) };
  },
  // ------------------------------------------------------------------------------------------ Data & Chance 6.5
  /** 6.SP.B: the median of an even number of values. */
  medianEven(rng) {
    let s; do { s = shuffled(rng, Array.from({ length: 18 }, (_, i) => i + 2)).slice(0, 4).sort((x, y) => x - y); } while (s[0] + s[3] === s[1] + s[2]);
    const shown = [s[2], s[0], s[3], s[1]], ans = (s[1] + s[2]) / 2;
    return { prompt: `What is the median of ${list(shown)}?`, answer: ans,
      distractors: take3(ans, [[(s[0] + s[3]) / 2, 'took-the-middle-two-without-sorting'], [r2((s[0] + s[1] + s[2] + s[3]) / 4), 'found-the-mean-instead'], [s[1], 'gave-only-one-of-the-two-middle-values'], [s[2], 'gave-only-the-upper-middle-value']]) };
  },
  /** 6.SP.B: the interquartile range from a box plot's five numbers. */
  iqrBox(rng) {
    const lo = ri(rng, 5, 20), q1 = lo + ri(rng, 3, 8), med = q1 + ri(rng, 2, 8), q3 = med + ri(rng, 2, 8), hi = q3 + ri(rng, 3, 12), ans = q3 - q1;
    return { prompt: `A box plot shows: lowest value ${lo}, lower quartile ${q1}, median ${med}, upper quartile ${q3}, highest value ${hi}. What is the interquartile range?`, answer: ans,
      distractors: take3(ans, [[hi - lo, 'gave-the-full-range'], [med, 'gave-the-median'], [q3, 'gave-the-upper-quartile'], [q3 - med, 'measured-from-the-median'], [q1, 'gave-the-lower-quartile'], [hi - q1, 'measured-to-the-highest-value']]) };
  },
  /** 6.SP.B: mean absolute deviation. */
  madCalc(rng) {
    let a, b; do { a = ri(rng, 1, 6); b = ri(rng, 1, 6); } while ((a + b) % 2 || a === b);
    const m = ri(rng, 8, 20), vals = shuffled(rng, [m - a, m - b, m + b, m + a]), ans = (a + b) / 2;
    return { prompt: `The values ${list(vals)} have a mean of ${m}. What is their mean absolute deviation (the average distance from the mean)?`, answer: ans,
      distractors: take3(ans, [[2 * (a + b), 'added-the-distances-but-did-not-divide'], [2 * Math.max(a, b), 'gave-the-range'], [m, 'gave-the-mean'], [Math.max(a, b), 'gave-the-largest-distance']]) };
  },
  // ------------------------------------------------------------------------------------------ Data & Chance 7.0
  /** 7.SP.A: scale a random sample up to the population. */
  sampleScale(rng) {
    const n = pickOne(rng, [20, 25, 40, 50]), k = ri(rng, 4, 12), hits = ri(rng, 3, Math.floor(n / 2) - 1), pop = n * k, ans = hits * k;
    return { prompt: `In a random sample of ${n} students, ${hits} walk to school. The school has ${pop} students. About how many students in the whole school walk to school?`, answer: ans,
      distractors: take3(ans, [[hits, 'gave-the-sample-count'], [pop - (n - hits), 'took-the-sample-walkers-as-everyone-else'], [Math.round(pop / hits), 'divided-the-wrong-pair-of-numbers'], [ans + hits, 'one-sample-too-many']]) };
  },
  /** 7.SP.A: which sample is likely to represent a population. */
  randomSample(rng) {
    const n = pickOne(rng, [40, 50, 60, 80]);
    const [want, handy] = pickOne(rng, [
      ['which lunch its students like best', `The first ${n} students in the lunch line on pizza day`],
      ['which sport its students like best', `The ${n} members of the soccer club`],
      ['how many hours its students sleep', `${n} students who stayed for the late study club`],
      ['how its students travel to school', `The first ${n} students to step off the school buses`],
    ]);
    return { prompt: `A school wants to know ${want}. Which sample is most likely to represent the whole school?`, answer: `${n} students picked at random from the list of all students`,
      distractors: d3([handy, 'handy-group-read-as-a-fair-sample'], ['All the students in one grade 6 class', 'one-class-read-as-the-whole-school'], [`${n} students who chose to answer a poster`, 'volunteers-read-as-a-random-sample']) };
  },
  /** 7.SP.B: a difference between two means measured in spreads. */
  meansInMads(rng) {
    let mad, mult; do { mad = ri(rng, 2, 5); mult = ri(rng, 2, 4); } while (mad === mult);
    const a = ri(rng, 120, 160), b = a + mad * mult;
    return { prompt: `Team A's mean height is ${a} cm and Team B's is ${b} cm. For both teams the mean absolute deviation is ${mad} cm. The difference between the means is how many times the mean absolute deviation?`, answer: mult,
      distractors: take3(mult, [[mad * mult, 'gave-the-difference-without-comparing-it-to-the-spread'], [mad, 'gave-the-spread'], [mad * mult * mad, 'multiplied-instead-of-dividing'], [mult + 1, 'slipped-on-the-division-fact']]) };
  },
  /** 7.SP.B: compare two groups by their medians. */
  compareMedians(rng) {
    const build = () => { const m = ri(rng, 5, 12); return { m, vals: shuffled(rng, pickOne(rng, [[-3, -1, 0, 2, 4], [-2, -1, 0, 1, 5], [-4, -2, 0, 1, 2], [-3, -2, 0, 3, 4]])).map(d => m + d) }; };
    let A, B, alt, diff, guard = 0;
    do { A = build(); B = build(); diff = Math.abs(A.m - B.m); alt = Math.abs(Math.max(...A.vals) - Math.max(...B.vals)); } while ((diff === 0 || alt === 0 || alt === diff) && guard++ < 60);
    const hi = A.m > B.m ? 'A' : 'B', lo = hi === 'A' ? 'B' : 'A';
    return { prompt: `Class A's quiz scores are ${list(A.vals)}. Class B's quiz scores are ${list(B.vals)}. Which class has the higher median score, and by how many points?`, answer: `Class ${hi}, by ${diff}`,
      distractors: d3([`Class ${lo}, by ${diff}`, 'compared-the-medians-the-wrong-way-round'], [`Class ${hi}, by ${alt}`, 'compared-the-highest-scores-not-the-medians'], ['The two medians are the same', 'did-not-find-both-medians']) };
  },
  // ------------------------------------------------------------------------------------------ Data & Chance 7.5
  /** 7.SP.C: the probability of one outcome. */
  probSimple(rng) {
    const counts = [ri(rng, 1, 6), ri(rng, 1, 6), ri(rng, 1, 6)], names = ['red', 'blue', 'green'], i = ri(rng, 0, 2), total = counts[0] + counts[1] + counts[2], f = counts[i];
    const ans = fr(f, total);
    return { prompt: `A bag holds ${counts[0]} red, ${counts[1]} blue and ${counts[2]} green tiles. One tile is picked without looking. What is the probability that it is ${names[i]}?`, answer: ans,
      distractors: take3(ans, [[fr(f, total - f), 'compared-with-the-other-tiles-not-the-total'], ['1/3', 'counted-colors-not-tiles'], [fr(total - f, total), 'found-the-chance-of-not-getting-it'], [fr(1, total), 'counted-one-tile-only'], [fr(total, f), 'turned-the-fraction-upside-down'], [fr(f, total + 1), 'miscounted-the-tiles']]) };
  },
  /** 7.SP.C: an expected count from a probability. */
  expectedCount(rng) {
    const [n, d] = pickOne(rng, [[1, 3], [1, 4], [1, 5], [1, 6], [2, 3], [3, 4], [2, 5]]), trials = d * ri(rng, 5, 20), ans = trials * n / d;
    return { prompt: `A spinner lands on red with probability ${n}/${d}. In ${trials} spins, about how many times would you expect it to land on red?`, answer: ans,
      distractors: take3(ans, [[trials - ans, 'gave-the-number-of-times-it-would-not-happen'], [trials * d, 'multiplied-by-the-bottom-number'], [d, 'gave-a-number-from-the-fraction'], [ans + n, 'slipped-on-the-division-fact']]) };
  },
  /** 7.SP.C: the probability that something does not happen. */
  complementProb(rng) {
    const tenths = pickOne(rng, [1, 2, 3, 4, 6, 7, 8, 9]), p = tenths / 10, ans = (10 - tenths) / 10;
    const [event, not] = pickOne(rng, [['a seed sprouts', 'it does not sprout'], ['the next bus is late', 'it is not late'], ['a traffic light is green', 'it is not green'], ['it rains tomorrow', 'it does not rain']]);
    return { prompt: `The probability that ${event} is ${p}. What is the probability that ${not}?`, answer: ans,
      distractors: d3([p, 'repeated-the-given-probability'], [(10 + tenths) / 10, 'added-to-one-instead-of-subtracting'], [tenths, 'treated-the-probability-as-a-count']) };
  },
  /** 7.SP.C: the size of a sample space for two stages. */
  sampleSpace(rng) {
    const k = pickOne(rng, [3, 4, 5, 8]);
    const [first, n1] = rng() < 0.5 ? ['A coin is flipped', 2] : ['A number cube is rolled', 6];
    const ans = n1 * k;
    return { prompt: `${first} and a spinner with ${k} equal parts is spun. How many different outcomes are possible?`, answer: ans,
      distractors: take3(ans, [[n1 + k, 'added-instead-of-multiplying'], [Math.max(n1, k), 'counted-one-stage-only'], [2 * ans, 'counted-every-outcome-twice'], [ans - 1, 'missed-one-outcome']]) };
  },
  // ------------------------------------------------------------------------------------------ Data & Chance 8.0
  /** 8.SP.A: the kind of association a scatter plot shows. */
  scatterAssociation(rng) {
    const KIND = { positive: 'A positive linear association', negative: 'A negative linear association', none: 'No association', curve: 'A nonlinear association' };
    const SEE = { positive: 'rise from left to right, close to a straight line', negative: 'fall from left to right, close to a straight line', none: 'are scattered with no pattern', curve: 'rise and then fall along a curve' };
    const [x, y, kind] = pickOne(rng, [['hours of practice', 'test score', 'positive'], ['the age of a tree', 'its height', 'positive'], ['height above sea level', 'air temperature', 'negative'], ['hours since a candle was lit', 'its height', 'negative'],
      ['shoe size', 'spelling score', 'none'], ['a house number', 'the height of its door', 'none'], ['time since a ball was thrown', 'the height of the ball', 'curve'], ['the angle of a ramp', 'how far a toy car jumps', 'curve']]);
    const why = wrong => (kind === 'none' ? (wrong === 'curve' ? 'saw-a-curve-in-scattered-points' : 'saw-a-trend-in-scattered-points')
      : wrong === 'none' ? 'missed-the-pattern-in-the-points'
        : kind === 'curve' ? 'forced-a-straight-line-onto-a-curve'
          : wrong === 'curve' ? 'called-a-straight-pattern-a-curve' : 'read-the-direction-backwards');
    return { prompt: `A scatter plot compares ${x} and ${y}. The points ${SEE[kind]}. What kind of association is this?`, answer: KIND[kind],
      distractors: Object.keys(KIND).filter(w => w !== kind).map(w => ({ value: KIND[w], misconception: why(w) })) };
  },
  /** 8.SP.A: use a trend line to predict. */
  trendPredict(rng) {
    const [what, xu, yu, ask] = pickOne(rng, TREND);
    const m = ri(rng, 2, 6), b = ri(rng, 1, 12), x = ri(rng, 3, 9), ans = m * x + b;
    return { prompt: `A trend line for ${what} is ${lineEq(m, b)}, where x is the number of ${xu}s and y is the ${yu}. What ${ask} does the line predict for ${xu} ${x}?`, answer: ans,
      distractors: take3(ans, [[m * x, 'left-out-the-starting-value'], [(m + b) * x, 'added-before-multiplying'], [m + b + x, 'added-all-three-numbers'], [b * x + m, 'swapped-the-rate-and-the-starting-value'], [ans + m, 'counted-one-step-too-many'], [ans + b, 'added-the-starting-value-twice']]) };
  },
  /** 8.SP.A: what the slope of a trend line means. */
  trendSlopeMeaning(rng) {
    const [what, xu, yu, , subject, unit] = pickOne(rng, TREND);
    let m, b; do { m = ri(rng, 2, 6); b = ri(rng, 1, 12); } while (m === b);
    return { prompt: `A trend line for ${what} is ${lineEq(m, b)}, where x is the number of ${xu}s and y is the ${yu}. What does the ${m} tell you?`, answer: `${subject} goes up about ${m} ${unit} each ${xu}`,
      distractors: d3([`${subject} was ${m} ${unit} at ${xu} 0`, 'read-the-rate-as-the-starting-value'], [`${subject} goes up about ${b} ${unit} each ${xu}`, 'read-the-starting-value-as-the-rate'], [`${subject} changes for only ${m} ${xu}s`, 'read-the-rate-as-an-amount-of-time']) };
  },
  /** 8.SP.A: the point that does not follow the trend. */
  scatterOutlier(rng) {
    const m = ri(rng, 2, 3), b = ri(rng, 0, 3), out = ri(rng, 2, 4), bump = ri(rng, 8, 12);
    const P = [1, 2, 3, 4, 5].map(x => [x, m * x + b + (x === out ? bump : 0)]), show = p => `(${p[0]}, ${p[1]})`;
    const other = P.find(p => p[0] !== out && p[0] !== 1 && p[0] !== 5);
    return { prompt: `A scatter plot has the points ${list(P.map(show))}. Which point is an outlier?`, answer: show(P[out - 1]),
      distractors: d3([show(P[4]), 'picked-the-point-farthest-to-the-right'], [show(P[0]), 'picked-the-point-with-the-smallest-values'], [show(other), 'picked-a-point-that-follows-the-trend']) };
  },
};

// [what the line describes, x unit, y phrase, the word the question asks with, the subject of the meaning sentence, its unit]
const TREND = [
  ["a plant's growth", 'week', 'height in cm', 'height', 'The height', 'cm'],
  ['a tank being filled', 'minute', 'depth of water in cm', 'depth', 'The depth', 'cm'],
  ['a hike', 'hour', 'distance walked in km', 'distance', 'The distance', 'km'],
  ['a melting block of ice', 'minute', 'amount of melted water in ml', 'amount', 'The amount of water', 'ml'],
];

/** The archetype names added here (the rung 6.0-8.0 bank's own). */
export const PRO_ARCHETYPE_NAMES = Object.freeze(Object.keys(PRO_ARCHETYPES));
