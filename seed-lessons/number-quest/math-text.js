// Number Quest Pro (grades 6-8): maths in running text. Two pure functions, no imports:
//
//   mathText(typed)  -> the text as the page prints it: a true minus sign (U+2212), ², ³, √, ×, ÷, °, ≤, ≥, ≠.
//                       An author may type "-3", "x^2", "sqrt(16)", "3 x 4", "<=": the learner never sees those.
//   sayMath(printed) -> the same text as a voice should say it: "negative 3", "x squared", "the square root
//                       of 16", "3 times 4", "65 degrees", "3 fourths". Read-aloud for a Pro slide and the
//                       spoken prompt of a Sorting Game item at rungs 6.0-8.0 go through it, because a
//                       voice drops or garbles the bare signs ("−3" is read "3"; "x²" is read "x 2").
//
// Only the Pro tier and the rung 6.0-8.0 items use this file. The Launchpad and Explorer decks and every
// item below rung 6 are spoken exactly as before (they never pass through here), so nothing a learner
// hears today changes. The drawn diagrams have their own, label-sized version (views/nq-diagrams-pro.js
// sayLabel); this one is for sentences, so it leaves a sentence's own "?" and "-" in words alone.

const SUP = { '⁰': 0, '¹': 1, '⁴': 4, '⁵': 5, '⁶': 6, '⁷': 7, '⁸': 8, '⁹': 9 };
// What may stand before a sign for it to mean "negative" and not "minus": the start, a space, an opening
// bracket or another operator. (A digit or a letter before it makes it a subtraction or a hyphen.)
const BEFORE_NEG = '(^|[\\s(\\[=<>≤≥≠≈×÷+−,:|])';

/** Typed text as it is printed. Idempotent: text already in the printed signs comes back unchanged. */
export function mathText(typed) {
  return String(typed ?? '')
    // comparisons first, so "<=" never loses its "=" to another rule
    .replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=/g, '≠')
    // exponents: x^2, 5^3, 2^10 (a power above 3 has no single sign for every digit: use the superscripts)
    .replace(/\^2(?!\d)/g, '²').replace(/\^3(?!\d)/g, '³')
    .replace(/\^(\d{1,2})/g, (_, d) => [...d].map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join(''))
    // roots: sqrt(16) or sqrt 16 -> √16; sqrt(a + b) keeps its brackets
    .replace(/\bsqrt\s*\(\s*([\w.]+)\s*\)/gi, '√$1').replace(/\bsqrt\s*(?=[\w(])/gi, '√')
    // times and divided by: "3 x 4", "3 * 4", "12 / 4" with spaces (a fraction is written without: 3/4)
    .replace(/(?<=[\d)²³]) [x*] (?=[\d(−-])/g, ' × ').replace(/(?<=[\w)²³]) \* (?=[\w(−-])/g, ' × ')
    .replace(/(?<=[\w)²³]) \/ (?=[\w(−-])/g, ' ÷ ')
    // degrees: "65 deg" / "65 degrees" stay words on purpose (they read well); "65 o" is never guessed.
    // minus: a hyphen that means "negative" (after a space, a bracket or an operator, before a digit, a
    // letter-variable or a bracket) and a spaced hyphen between two operands. A hyphen inside a word or a
    // range ("grades 6-8", "two-step") stays a hyphen.
    .replace(new RegExp(`${BEFORE_NEG}-(?=\\d|\\.\\d|[a-z]\\b|\\()`, 'gi'), '$1−')
    .replace(/(?<=[\d)²³°%]) - (?=[\w(√−.])/g, ' − ').replace(/(?<=(?:^|[\s(])[a-z]) - (?=[\d(√−.]|[a-z]\b)/gi, ' − ');
}

const DENOM = { 2: ['half', 'halves'], 3: ['third', 'thirds'], 4: ['fourth', 'fourths'], 5: ['fifth', 'fifths'], 6: ['sixth', 'sixths'], 8: ['eighth', 'eighths'], 10: ['tenth', 'tenths'], 12: ['twelfth', 'twelfths'], 100: ['hundredth', 'hundredths'] };
const fractionWords = (n, d) => {
  const names = DENOM[+d];
  // A fraction of whole numbers with an everyday denominator is said the way a teacher says it; anything
  // else (7/9, x/3, 3/x) is "over", which is always right.
  return names && /^\d+$/.test(n) ? `${n} ${+n === 1 ? names[0] : names[1]}` : `${n} over ${d}`;
};

/** Printed text as a voice should say it. Words, punctuation and plain numbers are left alone. */
export function sayMath(printed) {
  const tidy = x => x.replace(/\s+/g, ' ');
  let s = mathText(printed).replace(/_{2,}/g, ' blank ');
  // an unknown written "?" inside a number sentence ("6 × ? = 48"), never a sentence's own question mark
  s = s.replace(/(?<=[=+×÷−<>≤≥(] ?)\?(?= ?[=+×÷−<>≤≥)])/g, 'what').replace(/(?<=\d )\?(?= ?[=×÷+−])/g, 'what');
  // negative (the sign sits right against its number, after a space, a bracket or an operator), then minus
  s = s.replace(new RegExp(`${BEFORE_NEG}−(?=[\\d.a-z(√])`, 'gi'), '$1negative ').replace(/−/g, ' minus ');
  // absolute value: |−8|, |x − 3|
  s = s.replace(/\|([^|]{1,40})\|/g, ' the absolute value of $1 ');
  // roots, then powers
  s = s.replace(/∛\s*/g, ' the cube root of ').replace(/√\s*/g, ' the square root of ')
    .replace(/²/g, ' squared').replace(/³/g, ' cubed').replace(/([⁰¹⁴-⁹]+)/g, m => ` to the power ${[...m].map(c => SUP[c]).join('')}`);
  // degrees
  s = s.replace(/(?<=(?:^|[^\d.])1)°\s?C\b/g, ' degree Celsius').replace(/(?<=(?:^|[^\d.])1)°\s?F\b/g, ' degree Fahrenheit')
    .replace(/°\s?C\b/g, ' degrees Celsius').replace(/°\s?F\b/g, ' degrees Fahrenheit').replace(/(?<=(?:^|[^\d.])1)°/g, ' degree').replace(/°/g, ' degrees');
  // mixed numbers and fractions (written without spaces: 4 1/2, 3/4, x/3)
  s = s.replace(/(\d+) (\d+)\/(\d+)\b/g, (_, w, n, d) => `${w} and ${fractionWords(n, d)}`)
    .replace(/\b(\d+|[a-z])\/(\d+|[a-z])\b/gi, (_, n, d) => fractionWords(n, d));
  // a ratio written with spaces round its colon: 2 : 3 (a clock time, 3:30, has none)
  s = s.replace(/(?<=\w) : (?=\w)/g, ' to ');
  // a number against a bracket is a product: 3(x + 2). A number against x, y or n is said apart: 2x is
  // "2 x" (a unit is always written after a space: 3 m, 5 cm, so no other letter is touched); mx is "m x".
  s = s.replace(/(?<=[\d)])\(/g, ' times (').replace(/\b(\d+(?:\.\d+)?)([xyn])\b/g, '$1 $2').replace(/\bmx\b/g, 'm x');
  // the operators
  s = tidy(s).replace(/×/g, ' times ').replace(/÷/g, ' divided by ').replace(/≤/g, ' less than or equal to ').replace(/≥/g, ' greater than or equal to ')
    .replace(/≠/g, ' is not equal to ').replace(/≈/g, ' is about ').replace(/π/g, ' pi ');
  s = tidy(s).replace(/(?<=[\w)] )\+(?= [\w(])/g, 'plus').replace(/(?<=[\w)] ?)=(?= ?[\w(.])/g, ' equals ')
    .replace(/(?<=[\w)] )<(?= [\w(])/g, 'less than').replace(/(?<=[\w)] )>(?= [\w(])/g, 'greater than')
    .replace(/(\d)\s?%/g, '$1 percent');
  return tidy(s).replace(/\s+([.,;?!])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}
