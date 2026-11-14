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
  // Garden Count (kindergarten): counting out to 20, comparing two groups and two numerals to 10, and 11-19 as ten
  // ones and some more ones (its three chapters, GARDEN_CHAPTERS below).
  'garden-count': { 'ccss-math': ['K.CC.A.1', 'K.CC.B.4', 'K.CC.B.5', 'K.CC.C.6', 'K.CC.C.7', 'K.NBT.A.1'] },
  // Lily Hop (kindergarten to grade 1): putting together and taking away within 10, number partners and what makes
  // ten, adding and taking away within 20 by way of ten (its three chapters, LILY_CHAPTERS below).
  'lily-hop': { 'ccss-math': ['K.OA.A.1', 'K.OA.A.2', 'K.OA.A.3', 'K.OA.A.4', '1.OA.C.6', '1.OA.B.3'] },
  // Crate Stacker (grade 1): two-digit numbers as tens and ones (and counting past 100), comparing two of them with
  // >, = and <, adding within 100 and ten more or ten less (its three chapters, CRATE_CHAPTERS below).
  'crate-stacker': { 'ccss-math': ['1.NBT.B.2', '1.NBT.A.1', '1.NBT.B.3', '1.NBT.C.4', '1.NBT.C.5'] },
  // Balance Bridge (grades 1 and 2): what the equals sign means and the missing number in an equation, story problems
  // within 20 and then within 100, odd and even numbers and rows of equal groups (its three chapters, BRIDGE_CHAPTERS
  // below).
  'balance-bridge': { 'ccss-math': ['1.OA.D.7', '1.OA.D.8', '1.OA.A.1', '2.OA.A.1', '2.OA.C.3', '2.OA.C.4'] },
  // Rocket Supply (grade 2): three-digit numbers as hundreds, tens and ones, in expanded form and by name, skip
  // counting by 5s, 10s and 100s, comparing with >, = and <, adding and subtracting within 100 and the facts within
  // 20 (its three chapters, ROCKET_CHAPTERS below).
  'rocket-supply': { 'ccss-math': ['2.NBT.A.1', '2.NBT.A.3', '2.NBT.A.2', '2.NBT.A.4', '2.NBT.B.5', '2.OA.B.2'] },
  // Shape Hunt (kindergarten to grade 2): naming flat and solid shapes whatever their size or turn and telling them by
  // what defines them, putting shapes together to make new ones, and equal shares: halves, fourths and thirds (its
  // three chapters, SHAPE_CHAPTERS below).
  'shape-hunt': { 'ccss-math': ['K.G.A.2', '1.G.A.1', 'K.G.B.6', '1.G.A.2', '1.G.A.3', '2.G.A.3'] },
  // Kitchen Rush (kindergarten to grade 2): length in same-size units and on a ruler, time to the hour, the half hour
  // and five minutes with a.m. and p.m., coins and a dollar bill with their signs, sorting into categories and reading
  // picture graphs and bar graphs (its three measuring chapters, KITCHEN_CHAPTERS below). Its fourth chapter, The
  // Garden Gate, is the Launchpad finale: one round from each earlier unit, credited only to a step locked to it.
  'kitchen-rush': { 'ccss-math': ['1.MD.A.2', '2.MD.A.1', '1.MD.B.3', '2.MD.C.7', '2.MD.C.8', 'K.MD.B.3', '1.MD.C.4', '2.MD.D.10'] },
  // The 220 Dolch sight words, Pre-primer to Grade 3: high-frequency and irregularly spelled words read by sight.
  'word-trail': { 'ccss-ela': ['RF.K.3c', 'RF.1.3g', 'RF.2.3f', 'RF.3.3d'] },
  // Guessing a word letter by letter as it is read aloud: naming letters and their sounds.
  'shark-plank': { 'ccss-ela': ['RF.K.1d', 'RF.K.3a'] },
  // Spelling a five-letter word from position clues: spelling patterns, spelling words correctly.
  'word-peek': { 'ccss-ela': ['L.3.2f', 'L.4.2d'] },
});
/** Codes of an official game (by slug) in a framework ([] when none). */
export const gameCodes = (slug, framework) => [...(((GAMES[slug] || {})[framework]) || [])];
/** Fraction Factory's chapters (seed-games/fraction-factory.html CHAPTERS), for a step locked to one. */
export const FRACTION_CHAPTERS = Object.freeze({
  folds: ['2.G.A.3'], 'first-cuts': ['3.NF.A.1', '3.NF.A.2'], 're-slice': ['3.NF.A.3', '4.NF.A.1', '4.NF.A.2'], recipe: ['4.NF.B.3'],
});
/** Garden Count's chapters (seed-games/garden-count.html GardenCount.CHAPTERS), for a step locked to one. */
export const GARDEN_CHAPTERS = Object.freeze({
  count: ['K.CC.A.1', 'K.CC.B.4', 'K.CC.B.5'], compare: ['K.CC.C.6', 'K.CC.C.7'], teens: ['K.NBT.A.1'],
});
/** Lily Hop's chapters (seed-games/lily-hop.html LilyHop.CHAPTERS), for a step locked to one. */
export const LILY_CHAPTERS = Object.freeze({
  join: ['K.OA.A.1', 'K.OA.A.2'], apart: ['K.OA.A.3', 'K.OA.A.4'], twenty: ['1.OA.C.6', '1.OA.B.3'],
});
/** Crate Stacker's chapters (seed-games/crate-stacker.html CrateStacker.CHAPTERS), for a step locked to one. */
export const CRATE_CHAPTERS = Object.freeze({
  build: ['1.NBT.B.2', '1.NBT.A.1'], greater: ['1.NBT.B.3'], add: ['1.NBT.C.4', '1.NBT.C.5'],
});
/** Balance Bridge's chapters (seed-games/balance-bridge.html BalanceBridge.CHAPTERS), for a step locked to one. */
export const BRIDGE_CHAPTERS = Object.freeze({
  equal: ['1.OA.D.7', '1.OA.D.8'], story: ['1.OA.A.1', '2.OA.A.1'], groups: ['2.OA.C.3', '2.OA.C.4'],
});
/** Rocket Supply's chapters (seed-games/rocket-supply.html RocketSupply.CHAPTERS), for a step locked to one. */
export const ROCKET_CHAPTERS = Object.freeze({
  build: ['2.NBT.A.1', '2.NBT.A.3'], count: ['2.NBT.A.2', '2.NBT.A.4'], fuel: ['2.NBT.B.5', '2.OA.B.2'],
});
/** Shape Hunt's chapters (seed-games/shape-hunt.html ShapeHunt.CHAPTERS), for a step locked to one. */
export const SHAPE_CHAPTERS = Object.freeze({
  find: ['K.G.A.2', '1.G.A.1'], build: ['K.G.B.6', '1.G.A.2'], share: ['1.G.A.3', '2.G.A.3'],
});
/** Kitchen Rush's chapters (seed-games/kitchen-rush.html KitchenRush.CHAPTERS), for a step locked to one. `gate` is the
 *  Launchpad finale, The Garden Gate: one round from each of Units 1 to 6 (a teen number, adding over ten, tens and
 *  ones, the equals sign, hundreds, equal shares), so a step locked to it is credited with one code a unit. */
export const KITCHEN_CHAPTERS = Object.freeze({
  measure: ['1.MD.A.2', '2.MD.A.1'], clock: ['1.MD.B.3', '2.MD.C.7', '2.MD.C.8'], chart: ['K.MD.B.3', '1.MD.C.4', '2.MD.D.10'],
  gate: ['1.OA.C.6', '1.NBT.B.2', '2.NBT.A.1', 'K.NBT.A.1', '1.OA.D.7', '1.G.A.3'],
});
/** Games whose codes span several grades or tracks: a step of one is credited only with what it is known to play. */
export const LEVELLED = Object.freeze(['tug-of-math', 'sum-racer', 'fraction-factory', 'word-trail', 'garden-count', 'lily-hop', 'crate-stacker', 'balance-bridge', 'rocket-supply', 'shape-hunt', 'kitchen-rush']);
/** A code's grade: "3.OA.C.7" -> "3", "RF.K.3c" -> "K". */
const codeGrade = c => { const m = /^(K|\d)\./.exec(c) || /^[A-Z]+\.(K|\d)\./.exec(c); return m ? m[1] : ''; };
const optionsOf = o => { try { return new URLSearchParams(typeof o === 'string' ? o : ''); } catch { return new URLSearchParams(); } };
/** The track a step is locked to (lesson_steps.options, services/play-params.js), as codes, or null when not known. */
function lockedCodes(slug, framework, options) {
  const p = optionsOf(options);
  if (p.get('lock') !== '1' || framework !== 'ccss-math') return null;
  if (slug === 'sum-racer') { const n = /^\d{1,2}$/.test(p.get('level') || '') ? +p.get('level') : 0; return SUM_RACER_TRACKS[n] ? [...SUM_RACER_TRACKS[n]] : null; }
  if (slug === 'fraction-factory') { const ch = p.get('chapter') || ''; return Object.hasOwn(FRACTION_CHAPTERS, ch) ? [...FRACTION_CHAPTERS[ch]] : null; }
  if (slug === 'garden-count') { const ch = p.get('chapter') || ''; return Object.hasOwn(GARDEN_CHAPTERS, ch) ? [...GARDEN_CHAPTERS[ch]] : null; }
  if (slug === 'lily-hop') { const ch = p.get('chapter') || ''; return Object.hasOwn(LILY_CHAPTERS, ch) ? [...LILY_CHAPTERS[ch]] : null; }
  if (slug === 'crate-stacker') { const ch = p.get('chapter') || ''; return Object.hasOwn(CRATE_CHAPTERS, ch) ? [...CRATE_CHAPTERS[ch]] : null; }
  if (slug === 'balance-bridge') { const ch = p.get('chapter') || ''; return Object.hasOwn(BRIDGE_CHAPTERS, ch) ? [...BRIDGE_CHAPTERS[ch]] : null; }
  if (slug === 'rocket-supply') { const ch = p.get('chapter') || ''; return Object.hasOwn(ROCKET_CHAPTERS, ch) ? [...ROCKET_CHAPTERS[ch]] : null; }
  if (slug === 'shape-hunt') { const ch = p.get('chapter') || ''; return Object.hasOwn(SHAPE_CHAPTERS, ch) ? [...SHAPE_CHAPTERS[ch]] : null; }
  if (slug === 'kitchen-rush') { const ch = p.get('chapter') || ''; return Object.hasOwn(KITCHEN_CHAPTERS, ch) ? [...KITCHEN_CHAPTERS[ch]] : null; }
  return null;
}
/** The codes a lesson's game step practises (counted as practice when a student finishes it). A game played at one
 *  level (Shark Plank, Word Peek) gives all its codes. A levelled game (LEVELLED) gives only what the step is known to
 *  play: the track or chapter the step is locked to (options "lock=1&level=4", "lock=1&chapter=recipe"), else its codes
 *  of the lesson's grade ("3", "K"; Tug of Math: that grade's question kinds), else nothing: a step never claims every
 *  grade a game spans, because it does not record which track the student played. */
export function stepGameCodes(slug, framework, grade = '', options = '') {
  if (!LEVELLED.includes(slug)) return gameCodes(slug, framework);
  const locked = lockedCodes(slug, framework, options);
  if (locked) return locked;
  if (!grade) return [];
  if (slug === 'tug-of-math') return framework === 'ccss-math' && TUG_GRADES[grade] ? [...TUG_GRADES[grade]] : [];
  return gameCodes(slug, framework).filter(c => codeGrade(c) === grade);
}
/** The codes a lesson's game step covers (the "Covered by" column and the grade summary, never practice): what it
 *  practises, or, for a levelled game whose step says nothing either way (no grade, no lock), all the game's codes as
 *  coverage only. Tug of Math is the exception: it spans all eight grades, so an ungraded step covers nothing. */
export function stepGameCover(slug, framework, grade = '', options = '') {
  const practice = stepGameCodes(slug, framework, grade, options);
  if (practice.length || !LEVELLED.includes(slug) || slug === 'tug-of-math' || grade || lockedCodes(slug, framework, options)) return practice;
  return gameCodes(slug, framework);
}
/** A lesson's grade field ("3", "Grade 3", "K", "grade k") as a CCSS grade, or '' when it names none. */
export const lessonGrade = g => { const m = /^\s*(?:grade\s*)?(k|[1-8])\b/i.exec(String(g || '')); return m ? m[1].toUpperCase() : ''; };
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
/** Number Quest's steps, in every tier -> their primary CCSS-M statement codes (units.json, the locked registry;
 *  clusters left out). A unit names its tier (one without the field is Explorer's); a step's standards are keyed
 *  by that tier and its key is "<tier>-<n>". */
export function numberQuestSteps() {
  if (nqSteps) return nqSteps;
  const units = JSON.parse(fs.readFileSync(UNITS, 'utf8')).units || [];
  nqSteps = new Map();
  // (a unit marked `planned` is reserved, not built: it has no step a play could be credited to)
  for (const u of units.filter(x => x.planned !== true)) for (const s of u.steps || []) {
    const tier = ['launchpad', 'explorer', 'pro'].includes(u.tier) ? u.tier : 'explorer';
    const st = ((s.standards || {})[tier]) || {};
    const codes = (st.primary || []).filter(c => /^(K|\d)\.[A-Z]+\.[A-D]\.\d+[a-z]?$/.test(c));
    if (codes.length) nqSteps.set(`${tier}-${s.n}`, codes);
  }
  return nqSteps;
}
/** Course slug -> step key -> codes, by framework (only Number Quest today; CS Quest and Cyber Defenders are CSTA). */
export const COURSES = Object.freeze({ 'number-quest': { framework: 'ccss-math', steps: numberQuestSteps } });
