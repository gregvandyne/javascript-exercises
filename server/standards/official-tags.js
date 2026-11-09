// The Common Core codes Oomba's own official games, live modes and courses practise (docs/decisions.md "Standards beyond
// computer science"). Accurate and conservative: a code is listed only when the activity itself makes the child do what
// the statement says (answering 7 × 8 practises 3.OA.C.7; a word search practises no Language standard, so Word Hunt
// has none). Games for any subject (Quest Race, Question Battle, Brain Board) carry no codes of their own: what their
// questions practise comes from the questions (a quiz item's `cat`, e.g. Number Quest's banks) or the lesson's tags.
// tests/unit/standards-ccss.test.js checks every code here is in server/standards/ccss-*.json.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Tug of Math (the game and Oomba Live's "tug" mode): the codes of each grade's question kinds (seed-games/tug-of-math.html
 *  TugGen KINDS). Grade 4's mixed "a × b + c" questions and grade 8's powers of 2 are left untagged (no exact match). */
export const TUG_GRADES = Object.freeze({
  1: ['1.OA.C.6', '1.OA.D.8'],               // add / subtract within 20, "3 + ? = 7"
  2: ['2.OA.B.2', '2.NBT.B.5'],              // within 20 by mental strategies (doubles, missing addends), within 100
  3: ['3.OA.C.7', '3.NBT.A.2'],              // times tables and division facts, add / subtract within 1000
  4: ['4.NBT.B.5', '4.NBT.B.6'],             // 2-3 digit × 1 digit, ÷ 1 digit
  5: ['5.NBT.B.5', '5.NBT.B.6', '5.OA.A.1'], // multi-digit ×, ÷ by up to 12, order of operations with parentheses
  6: ['6.EE.A.1', '6.EE.A.2c', '6.RP.A.3c'], // squares, evaluating expressions in order, a percent of a quantity
  7: ['7.NS.A.1', '7.NS.A.2', '6.EE.B.7'],   // integers +, −, ×, ÷; one-step equations x + p = q, px = q
  8: ['7.EE.B.4a', '8.EE.A.2', '6.EE.A.1'],  // px + q = r, square roots, squares and cubes
});
/** Sum Racer's tracks (seed-games/sum-racer.html genQuestion). */
export const SUM_RACER_TRACKS = Object.freeze({
  1: ['1.OA.C.6'], 2: ['1.OA.C.6'], 3: ['2.NBT.B.5'], 4: ['3.OA.C.7'], 5: ['3.OA.C.7'], 6: ['3.OA.C.7'],
  7: ['2.NBT.B.5', '3.OA.C.7'], 8: ['3.OA.C.7'], 9: ['3.NBT.A.1'], 10: ['4.NBT.B.4'],
});
const uniq = list => [...new Set(list)];
/** Official game -> the codes it practises, by framework. */
export const GAMES = Object.freeze({
  'sum-racer': { 'ccss-math': uniq(Object.values(SUM_RACER_TRACKS).flat()) },
  'tug-of-math': { 'ccss-math': uniq(Object.values(TUG_GRADES).flat()) },
  // First Folds (halves, fourths, thirds of shapes), First Cuts (unit fractions, the number line), Re-Slice (equivalent
  // shares, comparing with unlike denominators), Recipe Math (adding slices as sums of unit fractions).
  'fraction-factory': { 'ccss-math': ['2.G.A.3', '3.NF.A.1', '3.NF.A.2', '3.NF.A.3', '4.NF.A.1', '4.NF.A.2', '4.NF.B.3'] },
  // The 220 Dolch sight words, Pre-primer to Grade 3: high-frequency and irregularly spelled words read by sight.
  'word-trail': { 'ccss-ela': ['RF.K.3c', 'RF.1.3g', 'RF.2.3f', 'RF.3.3d'] },
  // Guessing a word letter by letter as it is read aloud: naming letters and their sounds.
  'shark-plank': { 'ccss-ela': ['RF.K.1d', 'RF.K.3a'] },
  // Spelling a five-letter word from position clues: spelling patterns, spelling words correctly.
  'word-peek': { 'ccss-ela': ['L.3.2f', 'L.4.2d'] },
});
/** Codes of an official game (by slug) in a framework ([] when none). */
export const gameCodes = (slug, framework) => [...(((GAMES[slug] || {})[framework]) || [])];
/** The codes a lesson's game step practises: the game's, except Tug of Math, which is played at one grade: the lesson's
 *  grade ("3", "K"), or nothing when the lesson has none (a step never claims all eight grades at once). */
export function stepGameCodes(slug, framework, grade = '') {
  if (slug === 'tug-of-math') return framework === 'ccss-math' && TUG_GRADES[grade] ? [...TUG_GRADES[grade]] : [];
  return gameCodes(slug, framework);
}
/** Every framework a game has codes in. */
export const gameFrameworks = slug => Object.keys(GAMES[slug] || {}).filter(f => (GAMES[slug][f] || []).length);

// ---------------------------------------------------------------- Oomba Live modes
/** A saved live run's codes from its mode and settings (Tug of Math Live: the grade in its starter id "tug:<grade>:<len>"). */
export function liveRunCodes(mode, settings) {
  if (mode !== 'tug') return [];
  const id = settings && typeof settings === 'object' ? settings.tug : null;
  const m = /^tug:([1-8]):/.exec(String(id || ''));
  return m ? [...TUG_GRADES[+m[1]]] : [];
}

// ---------------------------------------------------------------- courses
const UNITS = fileURLToPath(new URL('../../seed-lessons/number-quest/units.json', import.meta.url));
let nqSteps = null;
/** Number Quest's steps -> their primary CCSS-M statement codes (units.json, the locked registry; clusters left out). */
export function numberQuestSteps() {
  if (nqSteps) return nqSteps;
  const units = JSON.parse(fs.readFileSync(UNITS, 'utf8')).units || [];
  nqSteps = new Map();
  for (const u of units) for (const s of u.steps || []) {
    const st = ((s.standards || {}).explorer) || {};
    const codes = (st.primary || []).filter(c => /^(K|\d)\.[A-Z]+\.[A-D]\.\d+[a-z]?$/.test(c));
    if (codes.length) nqSteps.set(`explorer-${s.n}`, codes);
  }
  return nqSteps;
}
/** Course slug -> step key -> codes, by framework (only Number Quest today; CS Quest and Cyber Defenders are CSTA). */
export const COURSES = Object.freeze({ 'number-quest': { framework: 'ccss-math', steps: numberQuestSteps } });
