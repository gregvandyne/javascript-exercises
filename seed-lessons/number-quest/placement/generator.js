// Number Quest placement item generator ("Tally's Sorting Game", spec §4).
// Loads templates.json and turns a template into one concrete item with randomised
// numbers inside the template's stated constraints. Pure and deterministic for a
// given seed: the same (templateId, seed) always yields the same item, so a
// placement run is reproducible and auditable.
//
// Item shape: { templateId, strand, rung, prompt, spokenPrompt, responseType,
//   answer, choices: [{value, misconception}] | null, answerIndex | null }
// For responseType "pick", choices holds 4 options (the key plus three
// misconception-tagged distractors) shuffled by the seeded RNG. For every other
// response type (numeric, count-out, drag, build) choices is null and the caller
// renders the answer space (keypad, objects, drag targets) itself; the worked
// key is `answer` and `distractorMisconceptions` lists what wrong work diagnoses.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATES = JSON.parse(fs.readFileSync(path.join(HERE, 'templates.json'), 'utf8')).templates;
export const BY_ID = new Map(TEMPLATES.map(t => [t.id, t]));

// Small seeded RNG (mulberry32). Never Math.random in item generation.
export function rngFromSeed(seed) {
  let a = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) a = (Math.imul(a, 31) + s.charCodeAt(i)) | 0;
  a = a || 0x9e3779b9;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive int
const pickOne = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const fmt = (n) => (typeof n === 'number' && !Number.isInteger(n)) ? String(Math.round(n * 100) / 100) : String(n);
const frac = (n, d) => `${n}/${d}`;

// Each archetype: (rng, gen, ctx) -> { prompt, answer, distractors: [{value, misconception}] }
// Distractor values must differ from the answer and from each other; the caller
// re-rolls a bounded number of times and then nudges, so an archetype may
// occasionally return a near-duplicate — the uniqueness guarantee lives in
// generateItem, not in each archetype.
export const ARCHETYPES = {
  count(rng, g, c) {
    const n = ri(rng, g.lo, g.hi);
    const glyphs = { seeds: '🌱', apples: '🍎', stars: '⭐', shells: '🐚', blocks: '🟦', birds: '🐦' };
    const glyph = glyphs[c] || '⭐';
    // manip: the objects as tappable counters, so a count-out item is counted with fingers, not just
    // read (the page renders one button per object; tapping marks it counted, and no total is shown).
    return { prompt: `Count the ${c}. How many are there? ${glyph.repeat(n)}`, answer: n, manip: { kind: 'count-out', glyph, count: n },
      distractors: [{ value: n + 1, misconception: 'counted-one-too-many' }, { value: Math.max(0, n - 1), misconception: 'missed-one-object' }, { value: n + 2, misconception: 'double-counted' }] };
  },
  // Hands-on archetypes for the mid rungs (repair round 3): the bank's count-out/build items used to
  // exist only at kindergarten rungs, so a standard-form run served no manipulation items at all.
  // These reuse the two response shapes the page already renders (tappable count-out counters and
  // ten-frame builds) at grades 3–5 depths: bigger builds, arrays, area by counting unit squares,
  // shape parts, sharing into piles and volume by counting one layer of cubes.
  buildTens(rng, g, c) {
    const tens = ri(rng, g.tens[0], g.tens[1]), extra = ri(rng, g.extra ? g.extra[0] : 1, g.extra ? g.extra[1] : 9);
    const answer = tens * 10 + extra;
    return { prompt: `Build the number with ten-frames: ${tens} frames are full and there are ${extra} loose counters. What number is built?`, answer,
      manip: { kind: 'build', tens, extra },
      distractors: [{ value: tens * 10, misconception: 'counted-only-the-full-frames' }, { value: answer - 10, misconception: 'missed-a-whole-ten-frame' }, { value: extra, misconception: 'counted-only-the-loose-counters' }] };
  },
  countGroups(rng, g, c) {
    const rows = ri(rng, g.rows[0], g.rows[1]), per = ri(rng, g.per[0], g.per[1]);
    const glyphs = { counters: '🟠', stars: '⭐', apples: '🍎', blocks: '🟦' };
    const glyph = glyphs[c] || '🟠', noun = c || 'counters';
    const answer = rows * per;
    return { prompt: `${rows} rows of ${per} ${noun} are set out on the table. Tap them to count, row by row. How many ${noun} are there in all?`, answer,
      manip: { kind: 'count-out', glyph, count: answer, rows, perRow: per },
      distractors: [{ value: answer + per, misconception: 'counted-one-row-too-many' }, { value: answer - per, misconception: 'missed-a-row' }, { value: rows + per, misconception: 'added-the-rows-instead-of-multiplying' }] };
  },
  countShare(rng, g, c) {
    const groups = ri(rng, g.groups[0], g.groups[1]), each = ri(rng, g.each[0], g.each[1]);
    const total = groups * each;
    return { prompt: `${total} counters are shared equally into ${groups} piles. Tap to count all the counters first. How many counters are in each pile?`, answer: each,
      manip: { kind: 'count-out', glyph: '🟠', count: total },
      distractors: [{ value: each + 1, misconception: 'one-too-many-in-each-pile' }, { value: each - 1, misconception: 'one-too-few-in-each-pile' }, { value: total - groups, misconception: 'took-the-piles-away-from-the-counters' }] };
  },
  countUnitSquares(rng, g, c) {
    const rows = ri(rng, g.rows[0], g.rows[1]), cols = ri(rng, g.cols[0], g.cols[1]);
    const answer = rows * cols;
    return { prompt: `A rectangle is tiled with unit squares: ${rows} rows of ${cols} squares. Tap the squares to count them. What is the area of the rectangle in square units?`, answer,
      manip: { kind: 'count-out', glyph: '🟦', count: answer, rows, perRow: cols },
      distractors: [{ value: answer + cols, misconception: 'counted-one-row-too-many' }, { value: answer - cols, misconception: 'missed-a-row' }, { value: rows + cols, misconception: 'added-the-sides-instead-of-counting-squares' }] };
  },
  countShapeParts(rng, g, c) {
    const shapes = { triangle: { glyph: '🔺', one: 'triangle', many: 'triangles', sides: 3, angles: 3 }, square: { glyph: '🟦', one: 'square', many: 'squares', sides: 4, angles: 4 }, pentagon: { glyph: '⬠', one: 'pentagon', many: 'pentagons', sides: 5, angles: 5 }, hexagon: { glyph: '⬡', one: 'hexagon', many: 'hexagons', sides: 6, angles: 6 } };
    const sh = shapes[g.shape] || shapes.triangle, part = g.part === 'angles' ? 'angles' : 'sides';
    const k = ri(rng, g.k[0], g.k[1]), per = sh[part], answer = k * per;
    return { prompt: `Here are ${k} ${sh.many}. Tap each ${sh.one} as you count its ${part}. How many ${part} do they have in all?`, answer,
      manip: { kind: 'count-out', glyph: sh.glyph, count: k },
      distractors: [{ value: k, misconception: `counted-the-shapes-not-their-${part}` }, { value: answer - per, misconception: 'missed-one-shape' }, { value: answer + per, misconception: 'counted-one-shape-too-many' }] };
  },
  countLayer(rng, g, c) {
    const layers = ri(rng, g.layers[0], g.layers[1]), rows = ri(rng, g.rows[0], g.rows[1]), per = ri(rng, g.per[0], g.per[1]);
    const layer = rows * per, answer = layers * layer;
    return { prompt: `A block is built from cubes in ${layers} layers. The picture shows one layer: ${rows} rows of ${per} cubes. Tap the cubes in the picture to count one layer. How many cubes are in the whole block?`, answer,
      manip: { kind: 'count-out', glyph: '🧊', count: layer, rows, perRow: per },
      distractors: [{ value: layer, misconception: 'counted-only-one-layer' }, { value: answer + layer, misconception: 'counted-one-layer-too-many' }, { value: answer - layer, misconception: 'missed-a-layer' }] };
  },
  countOn(rng, g, c) {
    const a = ri(rng, g.lo, g.hi), b = ri(rng, 2, 5);
    return { prompt: `Start at ${a}. Count on ${b} more. Where do you land?`, answer: a + b,
      distractors: [{ value: a + b - 1, misconception: 'counted-the-start-as-one' }, { value: a + b + 1, misconception: 'counted-one-too-far' }, { value: a - b, misconception: 'counted-backwards' }] };
  },
  skipCount(rng, g, c) {
    const step = g.step || 5, start = step * ri(rng, 1, 4);
    return { prompt: `Count by ${step}s: ${start}, ${start + step}, ${start + 2 * step}, ___. What comes next?`, answer: start + 3 * step,
      distractors: [{ value: start + 3 * step + 1, misconception: 'counted-by-ones-at-the-end' }, { value: start + 2 * step, misconception: 'repeated-the-last-term' }, { value: start + 4 * step, misconception: 'skipped-a-term' }] };
  },
  add(rng, g, c) {
    const a = ri(rng, g.lo, g.hi), b = ri(rng, g.lo2 ?? g.lo, g.hi2 ?? g.hi);
    return { prompt: c === 'word' ? `There are ${a} ${g.obj || 'stickers'} in a box. You add ${b} more. How many are there now?` : `What is ${a} + ${b}?`, answer: a + b,
      distractors: [{ value: a + b + 1, misconception: 'off-by-one' }, { value: Math.abs(a - b), misconception: 'subtracted-instead-of-adding' }, { value: a + b + 10, misconception: 'place-value-slip' }] };
  },
  subtract(rng, g, c) {
    const a = ri(rng, g.lo, g.hi), b = ri(rng, g.lo2 ?? 1, Math.max(2, Math.floor(g.hi / 2)));
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return { prompt: c === 'word' ? `You have ${hi} ${g.obj || 'marbles'}. You give away ${lo}. How many are left?` : `What is ${hi} − ${lo}?`, answer: hi - lo,
      distractors: [{ value: hi - lo + 1, misconception: 'off-by-one' }, { value: hi + lo, misconception: 'added-instead-of-subtracting' }, { value: Math.max(0, hi - lo - 2), misconception: 'counted-back-too-far' }] };
  },
  missingAdd(rng, g, c) {
    const a = ri(rng, g.lo, g.hi), b = ri(rng, 2, g.hi);
    return { prompt: `${a} + ___ = ${a + b}. What number is missing?`, answer: b,
      distractors: [{ value: b + 1, misconception: 'off-by-one' }, { value: a + b, misconception: 'gave-the-total' }, { value: Math.max(0, b - 1), misconception: 'off-by-one-low' }] };
  },
  multiply(rng, g, c) {
    const a = ri(rng, g.lo, g.hi), b = ri(rng, g.lo2 ?? 2, g.hi2 ?? 9);
    return { prompt: c === 'groups' ? `There are ${a} groups of ${b}. How many is that in all?` : `What is ${a} × ${b}?`, answer: a * b,
      distractors: [{ value: a + b, misconception: 'added-instead-of-multiplying' }, { value: a * b + a, misconception: 'one-group-too-many' }, { value: Math.max(0, a * b - b), misconception: 'one-group-too-few' }] };
  },
  divide(rng, g, c) {
    const b = ri(rng, g.lo, g.hi), q = ri(rng, 2, 12), a = b * q;
    return { prompt: c === 'share' ? `${a} treats are shared equally among ${b} friends. How many does each friend get?` : `What is ${a} ÷ ${b}?`, answer: q,
      distractors: [{ value: q + 1, misconception: 'off-by-one' }, { value: b, misconception: 'gave-the-divisor' }, { value: Math.max(1, q - 1), misconception: 'off-by-one-low' }] };
  },
  placeDigit(rng, g, c) {
    const places = [[1000, 'thousands'], [100, 'hundreds'], [10, 'tens'], [1, 'ones']].filter(([p]) => p <= (g.maxPlace || 100));
    const [place, name] = pickOne(rng, places);
    const n = ri(rng, place, (g.maxPlace || 100) * 10 - 1);
    const digit = Math.floor(n / place) % 10;
    return { prompt: `In the number ${n}, what is the value of the digit in the ${name} place?`, answer: digit * place,
      distractors: [{ value: digit, misconception: 'gave-the-digit-not-its-value' }, { value: digit * place * 10, misconception: 'one-place-too-big' }, { value: Math.max(0, digit * place / 10), misconception: 'one-place-too-small' }] };
  },
  roundNum(rng, g, c) {
    const place = g.place || 10, n = ri(rng, g.lo, g.hi);
    const ans = Math.round(n / place) * place;
    return { prompt: `Round ${n} to the nearest ${place === 10 ? 'ten' : place === 100 ? 'hundred' : 'thousand'}.`, answer: ans,
      distractors: [{ value: Math.floor(n / place) * place, misconception: 'always-rounds-down' }, { value: Math.ceil(n / place) * place === ans ? ans + place : Math.ceil(n / place) * place, misconception: 'always-rounds-up' }, { value: n, misconception: 'did-not-round' }] };
  },
  compare(rng, g, c) {
    let a = ri(rng, g.lo, g.hi), b = ri(rng, g.lo, g.hi); if (a === b) b += 1;
    const bigger = Math.max(a, b), smaller = Math.min(a, b);
    return { prompt: `Which number is greater: ${a} or ${b}?`, answer: bigger,
      distractors: [{ value: smaller, misconception: 'compared-the-wrong-way' }, { value: a + b, misconception: 'added-the-numbers' }, { value: Math.abs(a - b), misconception: 'gave-the-difference' }] };
  },
  orderNum(rng, g, c) {
    const a = ri(rng, g.lo, g.hi), b = a + ri(rng, 2, 20), d = b + ri(rng, 2, 20);
    return { prompt: `Put these in order, smallest first: ${b}, ${d}, ${a}. What is the middle number?`, answer: b,
      distractors: [{ value: a, misconception: 'gave-the-smallest' }, { value: d, misconception: 'gave-the-largest' }, { value: d - a, misconception: 'gave-the-range' }] };
  },
  tensMore(rng, g, c) {
    const ten = 10, extra = ri(rng, 1, 9);
    // manip: the build shown as counters — a filled ten-frame plus the loose counters beside it (the
    // pictorial step of the build, instead of the same fact as bare words).
    return { prompt: `A full ten-frame and ${extra} more counters. How many counters is that?`, answer: ten + extra, manip: { kind: 'build', tens: 1, extra },
      distractors: [{ value: extra, misconception: 'counted-only-the-leftovers' }, { value: ten, misconception: 'counted-only-the-frame' }, { value: ten + extra + 1, misconception: 'off-by-one' }] };
  },
  evenOdd(rng, g, c) {
    const n = ri(rng, g.lo, g.hi);
    return { prompt: `${n} counters are put into pairs. Is ${n} even or odd? Answer "even" or "odd".`, answer: n % 2 === 0 ? 'even' : 'odd', textAnswer: true,
      distractors: [{ value: n % 2 === 0 ? 'odd' : 'even', misconception: 'pairing-rule-reversed' }, { value: 'even', misconception: 'guessed-even' }, { value: 'odd', misconception: 'guessed-odd' }] };
  },
  fractionOf(rng, g, c) {
    const d = pickOne(rng, g.denoms || [2, 3, 4, 6, 8]);
    return { prompt: `A cake is cut into ${d} equal pieces. You take 1 piece. What fraction of the cake do you take? Answer like 1/${d}.`, answer: frac(1, d), textAnswer: true,
      distractors: [{ value: frac(1, d + 1), misconception: 'denominator-off-by-one' }, { value: frac(d - 1, d), misconception: 'counted-the-pieces-left' }, { value: frac(1, 2), misconception: 'always-a-half' }] };
  },
  fractionCompare(rng, g, c) {
    const pairs = [[1, 2, 1, 3], [2, 3, 1, 2], [3, 4, 1, 2], [1, 4, 1, 3], [2, 5, 1, 2], [5, 6, 3, 4]];
    const [n1, d1, n2, d2] = pickOne(rng, pairs);
    const v1 = n1 / d1, v2 = n2 / d2, bigger = v1 > v2 ? frac(n1, d1) : frac(n2, d2), smaller = v1 > v2 ? frac(n2, d2) : frac(n1, d1);
    return { prompt: `Which fraction is bigger: ${frac(n1, d1)} or ${frac(n2, d2)}?`, answer: bigger, textAnswer: true,
      distractors: [{ value: smaller, misconception: 'bigger-denominator-means-bigger-fraction' }, { value: frac(n1 + n2, d1 + d2), misconception: 'added-the-fractions' }, { value: 'they are equal', misconception: 'assumed-equal' }] };
  },
  fractionAdd(rng, g, c) {
    const d = pickOne(rng, g.denoms || [4, 6, 8, 10, 12]), a = ri(rng, 1, d - 2), b = ri(rng, 1, d - a - 1 || 1);
    return { prompt: `What is ${frac(a, d)} + ${frac(b, d)}? Answer like ${frac(a + b, d)}.`, answer: frac(a + b, d), textAnswer: true,
      distractors: [{ value: frac(a + b, d + d), misconception: 'added-the-denominators' }, { value: frac(Math.abs(a - b), d), misconception: 'subtracted-the-numerators' }, { value: frac(a + b + 1, d), misconception: 'off-by-one-numerator' }] };
  },
  fractionEquiv(rng, g, c) {
    const d = pickOne(rng, [2, 3, 4, 5]), k = ri(rng, 2, 4), n = ri(rng, 1, d - 1);
    return { prompt: `${frac(n, d)} is the same as ___/${d * k}. What number goes on top?`, answer: n * k,
      distractors: [{ value: n + k, misconception: 'added-the-multiplier' }, { value: n, misconception: 'left-the-numerator-alone' }, { value: n * k + 1, misconception: 'off-by-one' }] };
  },
  decimalAdd(rng, g, c) {
    const a = ri(rng, 11, 89) / 10, b = ri(rng, 11, 89) / 10, ans = Math.round((a + b) * 10) / 10;
    return { prompt: `What is ${fmt(a)} + ${fmt(b)}?`, answer: ans,
      distractors: [{ value: Math.round((a + b + 0.9) * 10) / 10, misconception: 'decimal-place-slip' }, { value: Math.round(Math.abs(a - b) * 10) / 10, misconception: 'subtracted-instead' }, { value: ans + 1, misconception: 'off-by-one' }] };
  },
  percentOf(rng, g, c) {
    const p = pickOne(rng, g.percents || [10, 25, 50, 75]), base = pickOne(rng, [40, 60, 80, 100, 120, 200]);
    const ans = (p / 100) * base;
    return { prompt: `What is ${p}% of ${base}?`, answer: ans,
      distractors: [{ value: p, misconception: 'gave-the-percent-as-the-answer' }, { value: base - ans, misconception: 'found-the-rest-not-the-part' }, { value: ans + base / 10, misconception: 'place-value-slip' }] };
  },
  ratioScale(rng, g, c) {
    const a = ri(rng, 1, 5), b = ri(rng, 2, 6), k = ri(rng, 2, 5);
    return { prompt: `A recipe uses ${a} cups of flour for every ${b} cups of milk. You use ${a * k} cups of flour. How many cups of milk do you need?`, answer: b * k,
      distractors: [{ value: b + k, misconception: 'added-the-scale-instead-of-multiplying' }, { value: b, misconception: 'kept-the-original-amount' }, { value: a * k, misconception: 'gave-the-flour-amount' }] };
  },
  unitRate(rng, g, c) {
    const per = ri(rng, 2, 9), k = ri(rng, 2, 6), total = per * k;
    return { prompt: `${k} notebooks cost $${total}. Each notebook costs the same. What is the cost of 1 notebook, in dollars?`, answer: per,
      distractors: [{ value: per + 1, misconception: 'off-by-one' }, { value: total, misconception: 'gave-the-total' }, { value: k, misconception: 'gave-the-count' }] };
  },
  intAdd(rng, g, c) {
    const a = -ri(rng, 3, 12), b = ri(rng, 2, 15), ans = a + b;
    return { prompt: `What is ${a} + ${b}?`, answer: ans,
      distractors: [{ value: Math.abs(a) + b, misconception: 'ignored-the-negative-sign' }, { value: ans === 0 ? -4 : -ans, misconception: 'sign-rule-reversed' }, { value: ans + 2, misconception: 'off-by-two-on-the-line' }] };
  },
  intCompare(rng, g, c) {
    const a = -ri(rng, 1, 12), b = -ri(rng, 1, 12); const aa = a === b ? a - 3 : a;
    const bigger = Math.max(aa, b), smaller = Math.min(aa, b);
    return { prompt: `Which number is greater: ${aa} or ${b}?`, answer: bigger,
      distractors: [{ value: smaller, misconception: 'bigger-absolute-value-means-bigger-number' }, { value: Math.abs(smaller), misconception: 'dropped-the-negative-sign' }, { value: 0, misconception: 'both-below-zero-so-zero' }] };
  },
  seqNext(rng, g, c) {
    const start = ri(rng, g.lo, g.hi), step = ri(rng, 2, 9) * (g.neg ? -1 : 1);
    const terms = [0, 1, 2, 3].map(i => start + i * step);
    return { prompt: `What comes next in this pattern? ${terms.join(', ')}, ___`, answer: start + 4 * step,
      distractors: [{ value: start + 4 * step + 1, misconception: 'off-by-one' }, { value: terms[3], misconception: 'repeated-the-last-term' }, { value: start + 3 * step + step * 2, misconception: 'doubled-the-step' }] };
  },
  exprEval(rng, g, c) {
    const x = ri(rng, 2, 9), m = ri(rng, 2, 6), b = ri(rng, 1, 12), ans = m * x + b;
    return { prompt: `If x = ${x}, what is ${m}x + ${b}?`, answer: ans,
      distractors: [{ value: m + x + b, misconception: 'added-everything' }, { value: m * x, misconception: 'forgot-the-added-term' }, { value: (m + b) * x, misconception: 'grouped-the-wrong-way' }] };
  },
  equation(rng, g, c) {
    const x = ri(rng, 2, 15), b = ri(rng, 3, 20);
    if (g.form === 'ax+b') { const m = ri(rng, 2, 6); return { prompt: `Solve: ${m}x + ${b} = ${m * x + b}. What is x?`, answer: x, distractors: [{ value: x + 1, misconception: 'off-by-one' }, { value: m * x + b, misconception: 'gave-the-total' }, { value: Math.max(1, x - 1), misconception: 'off-by-one-low' }] }; }
    return { prompt: `Solve: x + ${b} = ${x + b}. What is x?`, answer: x,
      distractors: [{ value: x + b, misconception: 'added-instead-of-subtracting' }, { value: b, misconception: 'gave-the-added-number' }, { value: x + 1, misconception: 'off-by-one' }] };
  },
  propSolve(rng, g, c) {
    const a = ri(rng, 2, 6), b = ri(rng, 2, 9), k = ri(rng, 2, 5);
    return { prompt: `${a}/${b} = ___/${b * k}. The two fractions are equal. What number is missing?`, answer: a * k,
      distractors: [{ value: a + k, misconception: 'added-the-scale' }, { value: a, misconception: 'kept-the-original' }, { value: b * k, misconception: 'gave-the-denominator' }] };
  },
  area(rng, g, c) {
    const l = ri(rng, g.lo, g.hi), w = ri(rng, 2, 9);
    return { prompt: `A rectangle is ${l} units long and ${w} units wide. What is its area in square units?`, answer: l * w,
      distractors: [{ value: 2 * (l + w), misconception: 'found-the-perimeter' }, { value: l + w, misconception: 'added-the-sides' }, { value: l * w + l, misconception: 'one-row-too-many' }] };
  },
  perimeter(rng, g, c) {
    const l = ri(rng, g.lo, g.hi), w = ri(rng, 2, 12);
    return { prompt: `A garden is ${l} metres long and ${w} metres wide. How many metres of fence go all the way around it?`, answer: 2 * (l + w),
      distractors: [{ value: l * w, misconception: 'found-the-area' }, { value: l + w, misconception: 'counted-only-two-sides' }, { value: 2 * (l + w) + 2, misconception: 'off-by-one-side' }] };
  },
  volume(rng, g, c) {
    const l = ri(rng, 2, 8), w = ri(rng, 2, 6), h = ri(rng, 2, 5);
    return { prompt: `A box is ${l} by ${w} by ${h} units. What is its volume in cubic units?`, answer: l * w * h,
      distractors: [{ value: l * w, misconception: 'found-one-face-only' }, { value: l + w + h, misconception: 'added-the-edges' }, { value: 2 * (l * w + w * h + l * h), misconception: 'found-the-surface-area' }] };
  },
  angle(rng, g, c) {
    const a = ri(rng, 20, 160);
    return { prompt: `Two angles on a straight line add to 180°. One angle is ${a}°. What is the other angle?`, answer: 180 - a,
      distractors: [{ value: 90 - (a % 90), misconception: 'used-a-right-angle-total' }, { value: a, misconception: 'copied-the-given-angle' }, { value: 180 - a + 10, misconception: 'place-value-slip' }] };
  },
  convert(rng, g, c) {
    const conv = pickOne(rng, g.convs || [['metres', 'centimetres', 100], ['kilograms', 'grams', 1000], ['litres', 'millilitres', 1000], ['hours', 'minutes', 60]]);
    const n = ri(rng, 2, 9);
    return { prompt: `How many ${conv[1]} are in ${n} ${conv[0]}?`, answer: n * conv[2],
      distractors: [{ value: n * 10, misconception: 'used-ten-as-the-factor' }, { value: n + conv[2], misconception: 'added-the-factor' }, { value: conv[2], misconception: 'gave-the-factor-only' }] };
  },
  elapsed(rng, g, c) {
    const start = ri(rng, 1, 10), dur = ri(rng, 1, 4);
    return { prompt: `A film starts at ${start} o'clock and lasts ${dur} hours. At what o'clock does it end? Give just the hour number.`, answer: start + dur > 12 ? start + dur - 12 : start + dur,
      distractors: [{ value: start, misconception: 'gave-the-start-time' }, { value: dur, misconception: 'gave-the-length' }, { value: (start + dur + 1 > 12 ? start + dur + 1 - 12 : start + dur + 1), misconception: 'counted-the-start-hour' }] };
  },
  money(rng, g, c) {
    const price = pickOne(rng, [25, 30, 40, 50, 60, 75, 80]), paid = 100, ans = paid - price;
    return { prompt: `A toy costs ${price} cents. You pay with 100 cents. How many cents of change do you get?`, answer: ans,
      distractors: [{ value: price, misconception: 'gave-the-price' }, { value: ans + 10, misconception: 'place-value-slip' }, { value: Math.max(0, ans - 5), misconception: 'counted-back-wrong' }] };
  },
  graphRead(rng, g, c) {
    const vals = [ri(rng, 2, 9), ri(rng, 2, 9), ri(rng, 2, 9)], names = ['Red', 'Blue', 'Green'];
    const idx = ri(rng, 0, 2);
    return { prompt: `A bar chart shows: Red team ${vals[0]} points, Blue team ${vals[1]} points, Green team ${vals[2]} points. How many points did the ${names[idx]} team score?`, answer: vals[idx],
      distractors: [{ value: vals[(idx + 1) % 3], misconception: 'read-the-wrong-bar' }, { value: vals[0] + vals[1] + vals[2], misconception: 'added-all-the-bars' }, { value: Math.max(...vals), misconception: 'always-picks-the-tallest-bar' }] };
  },
  graphCompare(rng, g, c) {
    const a = ri(rng, 3, 12), b = a + ri(rng, 1, 6);
    return { prompt: `A picture graph shows ${a} apples picked on Monday and ${b} apples picked on Tuesday. How many more apples were picked on Tuesday?`, answer: b - a,
      distractors: [{ value: a + b, misconception: 'added-instead-of-comparing' }, { value: b, misconception: 'gave-the-bigger-count' }, { value: b - a + 1, misconception: 'off-by-one' }] };
  },
  sortCount(rng, g, c) {
    const a = ri(rng, 2, 8), b = ri(rng, 2, 8), d = ri(rng, 1, 6), total = a + b + d;
    return { prompt: `In a basket there are ${a} red balls, ${b} blue balls and ${d} green balls. How many balls are there in all?`, answer: total,
      distractors: [{ value: a + b, misconception: 'left-one-group-out' }, { value: total + 1, misconception: 'off-by-one' }, { value: Math.max(a, b, d), misconception: 'gave-the-biggest-group' }] };
  },
  meanCalc(rng, g, c) {
    const m = ri(rng, 3, 12), vals = [m - 2, m, m + 2].map(v => Math.max(1, v));
    const mean = Math.round(vals.reduce((s, v) => s + v, 0) / 3);
    return { prompt: `What is the mean (average) of ${vals.join(', ')}?`, answer: mean,
      distractors: [{ value: vals[1], misconception: 'gave-the-middle-value-only' }, { value: vals.reduce((s, v) => s + v, 0), misconception: 'forgot-to-divide' }, { value: Math.max(...vals), misconception: 'gave-the-largest' }] };
  },
  medianCalc(rng, g, c) {
    const base = ri(rng, 2, 10), vals = [base, base + 3, base + 1, base + 5, base + 2];
    const sorted = [...vals].sort((x, y) => x - y);
    return { prompt: `What is the median of ${vals.join(', ')}?`, answer: sorted[2],
      distractors: [{ value: vals[2], misconception: 'took-the-middle-without-sorting' }, { value: Math.round(vals.reduce((s, v) => s + v, 0) / 5), misconception: 'found-the-mean-instead' }, { value: Math.max(...vals), misconception: 'gave-the-largest' }] };
  },
  prob(rng, g, c) {
    const fav = ri(rng, 1, 5), other = ri(rng, 1, 6), total = fav + other;
    return { prompt: `A bag has ${fav} red marbles and ${other} blue marbles. You pick one without looking. What is the chance it is red? Answer like ${fav}/${total}.`, answer: frac(fav, total), textAnswer: true,
      distractors: [{ value: frac(fav, other), misconception: 'compared-to-the-other-colour-not-the-total' }, { value: frac(other, total), misconception: 'picked-the-wrong-colour' }, { value: frac(1, total), misconception: 'counted-one-marble-only' }] };
  },
  chanceWord(rng, g, c) {
    const scenarios = [
      ['A spinner has 4 parts and all 4 are red. You spin once. How likely is red?', 'certain'],
      ['There are no green counters in a bag. You pick one. How likely is green?', 'impossible'],
      ['A coin is flipped. How likely is heads?', 'about half'],
    ];
    const [q, ans] = pickOne(rng, scenarios);
    const others = ['certain', 'impossible', 'about half', 'likely'].filter(w => w !== ans);
    return { prompt: `${q} Answer: certain, impossible, about half, or likely.`, answer: ans, textAnswer: true,
      distractors: others.slice(0, 3).map(w => ({ value: w, misconception: 'chance-word-mismatch' })) };
  },
  sides(rng, g, c) {
    const shapes = [['triangle', 3], ['square', 4], ['rectangle', 4], ['pentagon', 5], ['hexagon', 6], ['octagon', 8]];
    const [name, n] = pickOne(rng, shapes.filter(([, s]) => s >= (g.minSides || 3)));
    return { prompt: `How many sides does a ${name} have?`, answer: n,
      distractors: [{ value: n + 1, misconception: 'counted-a-corner-twice' }, { value: n - 1, misconception: 'missed-a-side' }, { value: n + 2, misconception: 'guessed' }] };
  },
  shapeName(rng, g, c) {
    const shapes = [[3, 'triangle'], [4, 'square'], [5, 'pentagon'], [6, 'hexagon'], [8, 'octagon']];
    const [n, name] = pickOne(rng, shapes);
    const others = shapes.filter(([, nm]) => nm !== name).map(([, nm]) => nm);
    return { prompt: `What is the name of a flat shape with ${n} sides?`, answer: name, textAnswer: true,
      distractors: [others[0], others[1], others[2]].map(w => ({ value: w, misconception: 'shape-name-mixup' })) };
  },
  symmetry(rng, g, c) {
    const shapes = [['square', 4], ['rectangle', 2], ['equilateral triangle', 3], ['regular hexagon', 6]];
    const [name, n] = pickOne(rng, shapes);
    return { prompt: `How many lines of symmetry does a ${name} have?`, answer: n,
      distractors: [{ value: n + 1, misconception: 'counted-a-diagonal-that-does-not-fold' }, { value: Math.max(0, n - 1), misconception: 'missed-a-fold-line' }, { value: n * 2, misconception: 'doubled-the-count' }] };
  },
  mixedOps(rng, g, c) {
    const a = ri(rng, 2, 12), b = ri(rng, 2, 9), d = ri(rng, 1, 10), ans = a * b + d;
    return { prompt: `What is ${a} × ${b} + ${d}?`, answer: ans,
      distractors: [{ value: a * (b + d), misconception: 'did-the-addition-first' }, { value: a * b, misconception: 'stopped-after-one-step' }, { value: ans + a, misconception: 'added-an-extra-group' }] };
  },
};

export function generateItem(template, seed) {
  const fn = ARCHETYPES[template.archetype];
  if (!fn) throw new Error(`unknown archetype ${template.archetype} in ${template.id}`);
  const rng = rngFromSeed(`${template.id}:${seed}`);
  let out = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    out = fn(rng, template.gen || {}, template.context || '');
    const vals = [out.answer, ...out.distractors.map(d => d.value)];
    if (new Set(vals.map(v => String(v))).size === vals.length) break;
    out = null;
  }
  if (!out) { // bounded nudge fallback: shift numeric distractors until unique
    out = fn(rngFromSeed(`${template.id}:${seed}:fallback`), template.gen || {}, template.context || '');
    const seen = new Set([String(out.answer)]);
    out.distractors = out.distractors.map(d => {
      let v = d.value, guard = 0;
      while (seen.has(String(v)) && guard++ < 20) v = typeof v === 'number' ? v + 1 : `${v} (other)`;
      seen.add(String(v));
      return { ...d, value: v };
    });
  }
  const spokenPrompt = out.prompt.replace(/[_]{2,}/g, 'blank');
  if (template.responseType !== 'pick') {
    return { templateId: template.id, strand: template.strand, rung: template.rung, prompt: out.prompt, spokenPrompt,
      responseType: template.responseType, answer: out.answer, choices: null, answerIndex: null,
      ...(out.manip ? { manip: out.manip } : {}),
      distractorMisconceptions: out.distractors.map(d => d.misconception) };
  }
  const choices = [{ value: out.answer, misconception: null }, ...out.distractors];
  for (let i = choices.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [choices[i], choices[j]] = [choices[j], choices[i]]; }
  return { templateId: template.id, strand: template.strand, rung: template.rung, prompt: out.prompt, spokenPrompt,
    responseType: 'pick', answer: out.answer, choices, answerIndex: choices.findIndex(ch => ch.misconception === null) };
}

export function generateById(id, seed = 1) {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`unknown template ${id}`);
  return generateItem(t, seed);
}
