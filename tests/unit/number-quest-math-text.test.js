// Maths in running text for Number Quest Pro (seed-lessons/number-quest/math-text.js): fractions, negative numbers,
// exponents, roots and degrees must PRINT properly in a Pro deck (whatever the author typed) and be SPOKEN sensibly
// by read-aloud, because a voice handed "−3" says "3" and handed "x²" says "x 2". Pinned here:
//   - mathText: typed stand-ins become the real signs (a true minus sign U+2212, ², ³, √, ×, ÷, ≤, ≥, ≠), a hyphen in
//     a word or a range stays a hyphen, and printed text comes back unchanged;
//   - sayMath: every sign is said in words, and a sentence's own words and punctuation are left alone;
//   - the read-aloud path (views/courses.js sayOf, used by the lesson page and by /api/tts): a Pro slide goes
//     through sayMath; every Launchpad and Explorer slide is said exactly as before;
//   - the Pro loader prints a typed deck and a typed check item with the real signs.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { mathText, sayMath } = await import('../../seed-lessons/number-quest/math-text.js');
const C = await import('../../server/services/courses.js');
const { sayOf } = await import('../../server/views/courses.js');
const M = '−';

test('mathText: what an author types is printed with the real signs', () => {
  const T = [
    ['The sample is at -6°C.', `The sample is at ${M}6°C.`],
    ['What is -8 + 3?', `What is ${M}8 + 3?`],
    ['5 - 2 = 3', `5 ${M} 2 = 3`],
    ['4 - (-7) = 11', `4 ${M} (${M}7) = 11`],
    ['y = -2x + 1', `y = ${M}2x + 1`],
    ['y = -x + 7', `y = ${M}x + 7`],
    ['a - b', `a ${M} b`], ['x - 3 = 4', `x ${M} 3 = 4`],
    ['(-3, 4) and (2, -5)', `(${M}3, 4) and (2, ${M}5)`],
    ['-0.5 and -.5', `${M}0.5 and ${M}.5`],
    ['x^2 + 5^3', 'x² + 5³'], ['2^10 and 10^6', '2¹⁰ and 10⁶'], ['a^2 + b^2 = c^2', 'a² + b² = c²'],
    ['sqrt(16) = 4', '√16 = 4'], ['sqrt 81', '√81'], ['sqrt(a + b)', '√(a + b)'], ['c = sqrt(a^2 + b^2)', 'c = √(a² + b²)'],
    ['3 x 4 = 12', '3 × 4 = 12'], ['a 6 x 4 grid', 'a 6 × 4 grid'], ['3 * 4', '3 × 4'], ['2 * x', '2 × x'], ['12 / 4 = 3', '12 ÷ 4 = 3'],
    ['x <= 4, y >= -2, z != 0', `x ≤ 4, y ≥ ${M}2, z ≠ 0`],
  ];
  for (const [typed, printed] of T) {
    assert.equal(mathText(typed), printed, typed);
    assert.equal(mathText(printed), printed, `printed text comes back unchanged: ${printed}`);
  }
});

test('mathText leaves words alone: hyphens in words and ranges, fractions, units, sentences', () => {
  for (const s of ['grades 6-8', 'a two-step problem', 'a well-known rule', 'pages 10-12', 'Tally said - wait - no.', 'a 3-4-5 triangle', 'the x-axis and the y-axis',
    '3/4 of a liter', '4 1/2 liters', 'x/3 = 4', '65° and 3°C', 'The ratio is 2 : 3 at 3:30 pm.', 'a room 6 m x 4 m (an x between units is left for the author to fix)', 'Is it true? Yes.', '', 'x', '10% of 250 ml',
    `${M}5 + 8 = 3`, 'a² + b²', '√16', '6 × 7', '6 ÷ 2', 'a box of 12']) {
    assert.equal(mathText(s), s, s);
  }
  assert.equal(mathText(null), ''); assert.equal(mathText(undefined), ''); assert.equal(mathText(42), '42');
});

test('sayMath: every sign is said in words', () => {
  const T = [
    // negatives and subtraction
    [`The sample is at ${M}6°C. Reach 4°C.`, 'The sample is at negative 6 degrees Celsius. Reach 4 degrees Celsius.'],
    [`What is ${M}8 + 3?`, 'What is negative 8 plus 3?'],
    [`5 ${M} 2 = 3`, '5 minus 2 equals 3'],
    [`5 ${M} (${M}3) = 8`, '5 minus (negative 3) equals 8'],
    [`${M}2.5 × 4 = ${M}10`, 'negative 2.5 times 4 equals negative 10'],
    [`Which is colder: ${M}8° or 3°?`, 'Which is colder: negative 8 degrees or 3 degrees?'],
    [`y = ${M}2x + 1`, 'y equals negative 2 x plus 1'], [`(${M}3, 4)`, '(negative 3, 4)'],
    ['What is -8 + 3?', 'What is negative 8 plus 3?'], // typed with a hyphen: said the same
    // fractions
    ['4 1/2 ÷ 3/4 = 6', '4 and 1 half divided by 3 fourths equals 6'],
    ['1/2, 1/3, 2/3, 1/4, 3/4, 2/5, 5/6, 3/8, 7/10', '1 half, 1 third, 2 thirds, 1 fourth, 3 fourths, 2 fifths, 5 sixths, 3 eighths, 7 tenths'],
    ['7/9 of the class', '7 over 9 of the class'], ['x/3 = 4', 'x over 3 equals 4'], ['The slope is 3/2.', 'The slope is 3 halves.'],
    // powers and roots
    ['x² + 5³', 'x squared plus 5 cubed'], ['a² + b² = c²', 'a squared plus b squared equals c squared'], ['2¹⁰', '2 to the power 10'], ['10⁶', '10 to the power 6'],
    ['√16 = 4', 'the square root of 16 equals 4'], ['c = √(a² + b²)', 'c equals the square root of (a squared plus b squared)'], ['What is √81?', 'What is the square root of 81?'],
    [`${M}√9`, 'negative the square root of 9'], ['x^2', 'x squared'], ['sqrt(49)', 'the square root of 49'],
    // degrees
    ['65°', '65 degrees'], ['1° more', '1 degree more'], ['21° and 31°', '21 degrees and 31 degrees'], ['72°F', '72 degrees Fahrenheit'], [`${M}5°C`, 'negative 5 degrees Celsius'], [`${M}1°C or 1°C, 11°C, 21°F and 1°F`, 'negative 1 degree Celsius or 1 degree Celsius, 11 degrees Celsius, 21 degrees Fahrenheit and 1 degree Fahrenheit'],
    // operators and relations
    ['3 × 4 = 12', '3 times 4 equals 12'], ['12 ÷ 4 = 3', '12 divided by 4 equals 3'], ['2 + 2 = 4', '2 plus 2 equals 4'],
    ['x ≤ 4', 'x less than or equal to 4'], [`x ≥ ${M}2`, 'x greater than or equal to negative 2'], ['x + 4 > 10', 'x plus 4 greater than 10'], [`Is ${M}3 < 2?`, 'Is negative 3 less than 2?'],
    ['a ≠ b', 'a is not equal to b'], ['π ≈ 3.14', 'pi is about 3.14'], ['30% of 250 ml', '30 percent of 250 ml'],
    // algebra
    ['3x + 5 = 23', '3 x plus 5 equals 23'], ['3(x + 2) = 3x + 6', '3 times (x plus 2) equals 3 x plus 6'], ['y = mx + b', 'y equals m x plus b'], ['2.5n', '2.5 n'],
    [`|${M}8| = 8`, 'the absolute value of negative 8 equals 8'], [`|x ${M} 3|`, 'the absolute value of x minus 3'],
    ['6 × ? = 48. What is missing?', '6 times what equals 48. What is missing?'], ['___ + 5 = 9', 'blank plus 5 equals 9'],
    // ratios
    ['The ratio is 2 : 3.', 'The ratio is 2 to 3.'],
  ];
  for (const [printed, said] of T) assert.equal(sayMath(printed), said, printed);
  // Nothing a voice garbles is left in any of them.
  for (const [printed] of T) assert.doesNotMatch(sayMath(printed), /[−√²³⁰¹⁴-⁹°×÷≤≥≠≈π%]|\d\/\d|_{2,}/, printed);
});

test('sayMath leaves a sentence alone: its words, its question mark, a clock time, a range, a point', () => {
  for (const s of ['Why? Because it is true.', 'Tally keeps the keys.', 'It is 3:30 pm.', 'grades 6-8', 'a two-step problem', 'from (0, 0) to (4, 6)', 'Is it colder? Yes!', 'd = 250m is one way to write it'.replace(' = ', ' is '), 'the x-axis', '5 cm and 3 m',
    'Seven gears are waiting, and the Great Clock will not start without all of them.']) {
    assert.equal(sayMath(s), s, s);
  }
});

test('read-aloud: a Pro slide is said through sayMath; every Launchpad and Explorer slide is said exactly as before', () => {
  const slide = { kind: 'example', title: 'Below zero', text: `From ${M}5°C it warms by 8°.`, steps: [`${M}5 + 8 = 3`, '3/4 of the way'], words: null };
  assert.equal(sayOf(slide), `Below zero. From ${M}5°C it warms by 8°. ${M}5 + 8 = 3, 3/4 of the way.`, 'with no band (or another band) the line is the text as written');
  assert.equal(sayOf(slide, 'explorer'), sayOf(slide)); assert.equal(sayOf(slide, 'launchpad'), sayOf(slide)); assert.equal(sayOf(slide, '2'), sayOf(slide), 'the other courses\' "Pro" band (2) is not Number Quest\'s');
  assert.equal(sayOf(slide, 'pro'), 'Below zero. From negative 5 degrees Celsius it warms by 8 degrees. negative 5 plus 8 equals 3, 3 fourths of the way.');
  assert.equal(sayOf({ title: 'T', text: 'x', say: `Say ${M}3 here.` }, 'pro'), 'Say negative 3 here.', 'a slide\'s own read-aloud line is put in words too');
  assert.equal(sayOf({ kind: 'words', title: 'Words', text: 'Two words.', words: [{ word: 'slope', means: 'rise ÷ run' }] }, 'pro'), 'Words. Two words. slope: rise divided by run.');
  // The whole of the two open streets: not one spoken line changed.
  const course = C.getCourse('number-quest');
  let lines = 0;
  for (const band of ['launchpad', 'explorer']) for (const step of C.steps(course, band)) for (const s of step.slides) {
    const before = s.say ? s.say : [s.title + '.', s.text, s.steps ? s.steps.join(', ') + '.' : '', s.words ? s.words.map(w => `${w.word}${w.means ? `: ${w.means}` : ''}.`).join(' ') : ''].filter(Boolean).join(' ');
    assert.equal(sayOf(s, step.band), before, `${step.key}: "${s.title}" is said as it always was`);
    lines++;
  }
  assert.ok(lines > 250, `every slide of both open streets was compared (${lines})`);
  // Both callers pass the step's band: the lesson page's data-say and the voice route.
  const view = fs.readFileSync(new URL('../../server/views/courses.js', import.meta.url), 'utf8'), tts = fs.readFileSync(new URL('../../server/routes/tts.js', import.meta.url), 'utf8');
  assert.match(view, /data-say="\$\{sayOf\(s, step && step\.band\)\}"/);
  assert.match(tts, /text: sayOf\(slide, step\.band\)/);
});

test('the Pro loader prints a typed slide and a typed check item with the real signs, and leaves the rest of them alone', () => {
  const s = C.proText.slide({ kind: 'example', title: 'From -5 to 3', text: 'Add 8: -5 + 8 = 3. Then 3^2 = 9 and sqrt(9) = 3.', say: 'Start at -5.', art: 'ruler', steps: ['-5 + 8 = 3', '3 x 4 = 12', 7], rows: [['x', '-2'], ['y', 'x^2']],
    visual: { type: 'numberline', label: 'From -5 up', min: -5, max: 5, marks: [] }, focus: [{ cue: 'It starts at -5.', box: [1, 2, 3, 4] }], story: { scene: 'street', lit: 1, chars: ['tally'] } });
  assert.equal(s.title, `From ${M}5 to 3`); assert.equal(s.text, `Add 8: ${M}5 + 8 = 3. Then 3² = 9 and √9 = 3.`); assert.equal(s.say, `Start at ${M}5.`);
  assert.deepEqual(s.steps, [`${M}5 + 8 = 3`, '3 × 4 = 12', '7']); assert.deepEqual(s.rows, [['x', `${M}2`], ['y', 'x²']]);
  assert.equal(s.focus[0].cue, `It starts at ${M}5.`); assert.deepEqual(s.focus[0].box, [1, 2, 3, 4]);
  assert.equal(s.kind, 'example'); assert.equal(s.art, 'ruler'); assert.deepEqual(s.story, { scene: 'street', lit: 1, chars: ['tally'] });
  assert.equal(s.visual.label, 'From -5 up', 'a diagram\'s own labels are the diagram cleaners\' job, not this pass\'s');
  const w = C.proText.slide({ kind: 'words', title: 'Words', text: 'One word.', words: [{ word: 'opposite', means: 'the opposite of 5 is -5' }] });
  assert.deepEqual(w.words, [{ word: 'opposite', means: `the opposite of 5 is ${M}5` }]);
  const it = C.proText.item({ id: 'x', answer: 1, q: 'What is -5 + 8?', choices: ['-13', '3', '13', '-3'], misconceptions: ['a', 'correct', 'b', 'c'], why: 'From -5, 8 steps up is 3.' });
  assert.equal(it.q, `What is ${M}5 + 8?`); assert.deepEqual(it.choices, [`${M}13`, '3', '13', `${M}3`]); assert.equal(it.why, `From ${M}5, 8 steps up is 3.`);
  assert.equal(it.answer, 1); assert.deepEqual(it.misconceptions, ['a', 'correct', 'b', 'c']); assert.equal(it.id, 'x');
  // The items the Pro welcome asks are served with the real signs, and the other tiers' items are served as written.
  assert.match(C.item('nq-pro-0.1-e3').q, /−5°C/);
  const raw = JSON.parse(fs.readFileSync(new URL('../../seed-lessons/number-quest/sets/u2-explorer.json', import.meta.url), 'utf8')).items;
  for (const r of raw) assert.deepEqual(C.item(r.id), r, `${r.id}: an Explorer item is served exactly as written`);
});
