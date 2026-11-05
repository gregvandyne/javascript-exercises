// Tally's Sorting Game — Number Quest's adaptive placement (math course spec §4, build brief Phase 1 item 1).
//
// What this is: a deliberately simple staircase ("CAT-lite"), not a psychometric engine. Four strands, each
// an independent staircase over half-grade rungs K.0–8.0; the student's grade seeds every strand half a rung
// below itself so the first questions feel winnable; a correct answer steps up half a rung, a wrong answer
// steps down; a rung is confirmed on two correct answers at it; a strand stops when its ceiling and floor are
// both found or its item budget runs out. The four placed rungs combine into ONE start node on the path via
// the locked crosswalk in seed-lessons/number-quest/placement.json (ties resolve to the lower unit).
//
// What it is not (spec §4.7): it never grades, ranks or labels a child, and it produces no score a child ever
// sees — the child hears Tally name a starting workshop. The grown-up output is the Starting Point note,
// which carries its caveat in the data itself (CAVEAT below), not just in page copy. Rungs are
// curriculum-order judgements by the course writers (spec §4.3), refined by item data after launch; nothing
// here certifies a grade. Items come from the Phase 0 bank (placement/generator.js): the same
// (template, seed) always regenerates the same item, so grading re-derives the key server-side and the page
// never holds an answer before the student gives theirs (the courses.js idiom).
//
// Also here: the soft-landing rule (§4.4), retakes that replace only on confirmation (§4.5), the absolute
// teacher/parent override incl. disabling the game (§4.5), and the per-unit 5-item test-out (§4.6).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, uid, now } from '../db.js';
import { TEMPLATES, generateItem, rngFromSeed } from '../../seed-lessons/number-quest/placement/generator.js';
import * as NQ from './number-quest-progress.js';
import { onAccountMerge } from './schools.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const PLACEMENT_LOCK = readJson('seed-lessons/number-quest/placement.json');
const UNITS = readJson('seed-lessons/number-quest/units.json');

export const COURSE_SLUG = 'number-quest';
const COURSE = Object.freeze({ slug: COURSE_SLUG });

/** The four strands, in the order the tour visits them. Keys are the bank's; labels are the lock's names. */
export const STRANDS = Object.freeze(['number', 'algebra', 'shape-measure', 'data-chance']);
export const STRAND_LABELS = Object.freeze({
  number: 'Number', algebra: 'Algebra & Patterns', 'shape-measure': 'Shape & Measure', 'data-chance': 'Data & Chance',
});
/** Every rung, K.0 (0) to 8.0 in half steps: 17 rungs. */
export const RUNGS = Object.freeze(Array.from({ length: 17 }, (_, i) => i / 2));
export const MAX_RUNG = 8;
/** Item budgets (spec §4.2 design targets): the Launchpad form serves 3–4 per strand. The standard
 *  form was 7 per strand (28 items at most) until the parity repair round shortened it to 5: a mixed
 *  run that takes the whole budget now serves at most 20 items, so the game feels like a tour, not an
 *  exam. Strands still stop sooner whenever ceiling and floor are both found. */
export const BUDGET = Object.freeze({ standard: 5, launchpad: 4 });
/** The Launchpad form folds Algebra & Patterns into Number (spec §4.2) and is audio-first throughout. */
export const LAUNCHPAD_STRANDS = Object.freeze(['number', 'shape-measure', 'data-chance']);
/** The caveat printed on every Starting Point note (spec §4.4), kept in the data so no view can drop it. */
export const CAVEAT = "A ten-minute routing game, not a grade. It samples; it doesn't certify. Units before the start point remain open for review and test-out.";
/** Response types that count as manipulation items for the every-third-item feel rule (spec §4.2). */
export const MANIPULATION_TYPES = Object.freeze(['drag', 'count-out', 'build']);
/** Test-out (spec §4.6): 5 items at unit depth, pass at 4. */
export const TESTOUT_ITEMS = 5;
export const TESTOUT_PASS = 4;

const clampRung = r => Math.min(MAX_RUNG, Math.max(0, Math.round(r * 2) / 2));
/** "K" reads as grade 0; anything unusable (including the grown-up escape) seeds at grade 3, the course's
 *  centre of gravity (spec §4.1). */
export function seedGrade(grade) {
  if (grade === 'K' || grade === 'k') return 0;
  const g = Number(grade);
  return Number.isInteger(g) && g >= 0 && g <= 8 ? g : 3;
}
/** The rung a strand starts on for a grade: the grade itself minus half a rung, floored at K.0 (spec §4.1). */
export const seedRung = grade => clampRung(seedGrade(grade) - 0.5);
/** The current grade derived from a stored declaration (Greg's addendum, 2026-11-04 20:55): the grade a
 *  student declared, plus one for every school-year rollover since the day it was declared, capped at
 *  grade 8. A rollover is September 1 (the platform reckons days in UTC, like `today` in db.js): a grade
 *  declared ON September 1 is the new school year's grade and does not advance until the next one; one
 *  declared the day before advances the next morning. Nothing declared -> null; a declaration without a
 *  date (rows from before migration 0051 are backfilled, so this is a belt-and-braces case) stands as
 *  declared. The stored grade is never edited upward by time — this derivation is the only way it moves. */
export function deriveGrade(declaredGrade, declaredAt, at = now()) {
  if (declaredGrade === null || declaredGrade === undefined) return null;
  const g = seedGrade(declaredGrade);
  if (!declaredAt) return g;
  const d = new Date(declaredAt), a = new Date(at);
  const dDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const aDay = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  let rollovers = 0;
  for (let y = d.getUTCFullYear(); y <= a.getUTCFullYear(); y++) {
    const sept1 = Date.UTC(y, 8, 1);
    if (sept1 > dDay && sept1 <= aDay) rollovers += 1;
  }
  return Math.min(MAX_RUNG, g + rollovers);
}
/** Which form a seed grade plays: K–2 seeds get the short audio-first Launchpad form. */
export const formForGrade = grade => (seedGrade(grade) <= 2 ? 'launchpad' : 'standard');
export const strandsForForm = form => (form === 'launchpad' ? LAUNCHPAD_STRANDS : STRANDS);
export const rungLabel = r => (r === 0 ? 'K.0' : String(r % 1 ? r.toFixed(1) : `${r}.0`));

// ------------------------------------------------------------------------------------------------- the staircase
const blankStrand = start => ({ rung: start, seedRung: start, correct: {}, misses: {}, items: 0, used: [], done: false });

/** A fresh staircase state. `seed` makes item choice reproducible; `reseedRungs` (a retake, §4.5) starts each
 *  strand at its last placed rung instead of the grade seed, so the retake converges in fewer items. */
export function createRunState({ grade = 3, seed = 'run', reseedRungs = null } = {}) {
  const form = formForGrade(grade);
  const strands = {};
  for (const key of strandsForForm(form)) {
    const start = reseedRungs && typeof reseedRungs[key] === 'number' ? clampRung(reseedRungs[key]) : seedRung(grade);
    strands[key] = blankStrand(start);
  }
  return { grade: seedGrade(grade), form, seed: String(seed), served: 0, lastStrand: null, seen: [], strands };
}

/** The highest rung with two correct answers at it, or null when no rung is confirmed yet (spec §4.2). */
export function confirmedRung(strand) {
  let best = null;
  for (const [r, n] of Object.entries(strand.correct)) if (n >= 2 && (best === null || +r > best)) best = +r;
  return best;
}
const missesBelowSeed = strand => Object.entries(strand.misses).reduce((sum, [r, n]) => sum + (+r < strand.seedRung ? n : 0), 0);

/** Has this strand found both ends (or run out of budget)? Ceiling: a confirmed top rung, or two misses at
 *  the rung above the confirmed one. Floor: two misses below the seed rung, or the staircase has reached
 *  K.0 and missed there twice (there is nowhere lower to look). */
export function strandDone(strand, form = 'standard') {
  if (strand.done) return true;
  if (strand.items >= (form === 'launchpad' ? BUDGET.launchpad : BUDGET.standard)) return true;
  const confirmed = confirmedRung(strand);
  const ceiling = confirmed === MAX_RUNG || (confirmed !== null && (strand.misses[confirmed + 0.5] || 0) >= 2);
  const floor = missesBelowSeed(strand) >= 2 || (strand.rung === 0 && (strand.misses[0] || 0) >= 2);
  return !!(confirmed !== null && ceiling && floor);
}

/** Record one answer at the strand's current rung and step the staircase: correct up half a rung, wrong
 *  down half a rung. Mutates and returns the strand state. */
export function recordAnswer(state, strandKey, correct) {
  const s = state.strands[strandKey];
  if (!s || s.done) return s || null;
  const at = String(s.rung);
  if (correct) s.correct[at] = (s.correct[at] || 0) + 1; else s.misses[at] = (s.misses[at] || 0) + 1;
  s.items += 1;
  s.rung = clampRung(s.rung + (correct ? 0.5 : -0.5));
  s.done = strandDone(s, state.form);
  return s;
}

/** Where a finished (or stopped-early) strand places: its confirmed rung; else the highest rung it answered
 *  correctly once; else half a rung under its seed. `confirmed` says which kind of answer this is, so the
 *  note can be honest about a strand the game did not settle. */
export function placedRung(strand) {
  const confirmed = confirmedRung(strand);
  if (confirmed !== null) return { rung: confirmed, confirmed: true };
  const anyCorrect = Object.keys(strand.correct).map(Number);
  if (anyCorrect.length) return { rung: Math.max(...anyCorrect), confirmed: false };
  // Nothing correct: the misses are the evidence — place half a rung under the lowest rung missed
  // (a strand stopped after one miss lands just under its seed; one that missed all the way down
  // lands at the floor it reached). No answers at all: just under the seed.
  const anyMiss = Object.keys(strand.misses).map(Number);
  if (anyMiss.length) return { rung: clampRung(Math.min(...anyMiss) - 0.5), confirmed: false };
  return { rung: clampRung(strand.seedRung - 0.5), confirmed: false };
}

/** The next strand to serve: strands alternate (a tour, not four exams), skipping finished ones. */
export function nextStrand(state) {
  const keys = Object.keys(state.strands).filter(k => !state.strands[k].done);
  if (!keys.length) return null;
  if (!state.lastStrand) return keys[0];
  const i = Object.keys(state.strands).indexOf(state.lastStrand);
  for (let step = 1; step <= Object.keys(state.strands).length; step++) {
    const k = Object.keys(state.strands)[(i + step) % Object.keys(state.strands).length];
    if (keys.includes(k)) return k;
  }
  return keys[0];
}
export const runFinished = state => nextStrand(state) === null;

/** Pick the next template for a strand: at its current rung (nearest rung with fresh templates otherwise),
 *  never repeating a template in a run, and every third item served overall prefers a manipulation type
 *  (drag / count-out / build) when one exists at the rung (spec §4.2 feel rules). Deterministic in the seed.
 *  `avoid` names templates the caller has already tried for this serve (the verbatim-repeat guard in
 *  serveNext): they are skipped as if used, for this pick only. */
export function pickTemplate(state, strandKey, avoid = null) {
  const s = state.strands[strandKey];
  if (!s) return null;
  const wantManipulation = (state.served + 1) % 3 === 0;
  const fresh = (t, rung) => t.strand === strandKey && t.rung === rung && !s.used.includes(t.id) && !(avoid && avoid.has(t.id));
  const byDist = [...RUNGS].sort((a, b) => Math.abs(a - s.rung) - Math.abs(b - s.rung) || a - b);
  const choose = pool => pool[Math.floor(rngFromSeed(`${state.seed}:${strandKey}:${s.items}:${state.served}`)() * pool.length)];
  // Every third item is a hands-on one where the bank has one NEAR the rung: search a full rung
  // either side for a manipulation template before settling for a text item at the exact rung, so a
  // mid-rung run meets hands-on items regularly instead of only when the staircase sits exactly on
  // a rung that has one (repair round 3: the bank's hands-on items used to live at kindergarten
  // rungs only, and the exact-rung preference meant standard-form runs almost never saw one).
  if (wantManipulation) {
    for (const rung of byDist) {
      if (Math.abs(rung - s.rung) > 1) break;
      const m = TEMPLATES.filter(t => fresh(t, rung) && MANIPULATION_TYPES.includes(t.responseType));
      if (m.length) return choose(m);
    }
  }
  for (const rung of byDist) {
    let pool = TEMPLATES.filter(t => fresh(t, rung));
    if (!pool.length) continue;
    if (wantManipulation) { const m = pool.filter(t => MANIPULATION_TYPES.includes(t.responseType)); if (m.length) pool = m; }
    return choose(pool);
  }
  return null;
}

/** Serve the next item of a run: { strand, strandLabel, templateId, itemSeed, item } where `item` is the
 *  public shape (no key: choices carry values only, non-pick items carry no answer at all). The caller
 *  stores templateId + itemSeed on the run; grading regenerates the item to recover the key. */
export function serveNext(state) {
  const strandKey = nextStrand(state);
  if (!strandKey) return null;
  const s = state.strands[strandKey];
  // No verbatim repeats inside one run (repair round 3): a template is never repeated, but two
  // DIFFERENT templates can still deal the same item when they share a small value pool — the
  // evaluator drew "Which fraction is bigger: 1/2 or 1/3?" twice and "mean of 7, 9, 11" twice in a
  // single sitting. So a serve is accepted only when its prompt-and-answer signature is new to the
  // run: try other fresh templates first, then re-deal the picked template from a salted seed
  // (grading re-derives the key from the stored itemSeed, so a salted deal grades like any other).
  if (!Array.isArray(state.seen)) state.seen = []; // runs saved before this guard carry none
  const baseSeed = `${state.seed}:${strandKey}:${s.items}`;
  const sigOf = full => `${full.prompt} => ${full.answer}`;
  let accepted = null;
  const tried = new Set();
  for (let attempt = 0; attempt < 6 && !accepted; attempt++) {
    const template = attempt === 0 ? pickTemplate(state, strandKey) : pickTemplate(state, strandKey, tried);
    if (!template) break;
    tried.add(template.id);
    const full = generateItem(template, baseSeed);
    if (!state.seen.includes(sigOf(full))) accepted = { template, itemSeed: baseSeed, full };
  }
  if (!accepted) {
    const template = pickTemplate(state, strandKey);
    if (!template) { state.strands[strandKey].done = true; return serveNext(state); }
    for (let salt = 1; salt <= 8 && !accepted; salt++) {
      const itemSeed = `${baseSeed}:r${salt}`;
      const full = generateItem(template, itemSeed);
      if (!state.seen.includes(sigOf(full))) accepted = { template, itemSeed, full };
    }
    if (!accepted) { const itemSeed = `${baseSeed}:r9`; accepted = { template, itemSeed, full: generateItem(template, itemSeed) }; }
  }
  const { template, itemSeed, full } = accepted;
  state.seen.push(sigOf(full));
  s.used.push(template.id);
  state.served += 1;
  state.lastStrand = strandKey;
  return {
    strand: strandKey, strandLabel: STRAND_LABELS[strandKey], templateId: template.id, itemSeed,
    audioFirst: !!template.audioFirst || state.form === 'launchpad' || template.rung <= 2.5,
    // How far along the game this item is: served so far out of the most the run can serve (the
    // strands' budgets added up). The child sees a trail filling, never a score — but they can feel
    // how much longer the game has to go.
    progress: { served: state.served, total: Object.keys(state.strands).length * (state.form === 'launchpad' ? BUDGET.launchpad : BUDGET.standard) },
    item: {
      prompt: full.prompt, spokenPrompt: full.spokenPrompt, responseType: full.responseType,
      // A hands-on item's counters (count-out objects to tap, a build's ten-frame): the manipulation
      // itself, rendered by the page — the numbers in it are the ones the prompt already shows.
      ...(full.manip ? { manip: full.manip } : {}),
      choices: full.choices ? full.choices.map(c => ({ value: c.value })) : null,
    },
  };
}

/** Grade one served item by regenerating it (the key never left the server). Pick items grade by choice
 *  index; every other type grades the typed/shown value against the worked key, numbers numerically. */
export function gradeServed(templateId, itemSeed, answer) {
  const template = TEMPLATES.find(t => t.id === templateId);
  if (!template) return null;
  const full = generateItem(template, itemSeed);
  let correct = false;
  if (full.responseType === 'pick') {
    correct = Number.isInteger(answer && answer.choice) && answer.choice === full.answerIndex;
  } else {
    const given = String((answer && answer.value) ?? '').trim().replace(/\s+/g, ' ');
    const key = String(full.answer).trim();
    const gn = Number(given.replace(',', '.')), kn = Number(key);
    correct = given !== '' && (Number.isFinite(gn) && Number.isFinite(kn) ? Math.abs(gn - kn) < 1e-9 : given.toLowerCase() === key.toLowerCase());
  }
  return { correct, answer: full.answer, template };
}

// ------------------------------------------------------------------------------------------------- the crosswalk
const unitTitle = n => { const u = UNITS.units.find(x => x.n === n); return u ? u.title : null; };
/** Every start node the game (or an override) can name, in path order. Only BUILT workshops are
 *  nameable: a start node is a place a child can actually open. Phase 2 (2026-11-05) built out the
 *  street, so the list runs to Unit 7's door — plus one more node that is not a unit door at all:
 *  the finale door, explorer-7.4 (the Vault of Measures), where a run lands when its strands meet
 *  every unit's entry profile (see crosswalk). It never names an unbuilt node, and never shows a
 *  child a fallback label in place of a workshop. */
export const START_NODES = Object.freeze([...[0, 1, 2, 3, 4, 5, 6, 7].map(n => Object.freeze({
  node: `explorer-${n}.1`, unit: n,
  workshop: unitTitle(n),
  built: true,
})), Object.freeze({ node: 'explorer-7.4', unit: 7, workshop: 'The Vault of Measures', built: true, finale: true })]);
export const nodeInfo = node => START_NODES.find(x => x.node === node) || START_NODES[0];

/** The locked crosswalk (placement.json): the start node is the first Explorer unit (1–7) whose entry
 *  profile the four placed rungs do not fully meet — a near-miss counts as not met, so ties resolve to the
 *  LOWER unit. Any rung below 2.5 puts the start in the Launchpad tier, whose content is still being built:
 *  the learner starts at the intro and the note flags the gap. All seven profiles met → the strands point
 *  past every workshop: the start is the finale door (explorer-7.4, the Vault of Measures) and
 *  `finaleDoor` rides along so the child and the grown-up note can both say the street is finished and
 *  the Vault is waiting. (Phase 1, when Units 5–7 were unbuilt, landed such a run at Unit 4's door with
 *  a "still being built" note; that copy retired with Phase 2.)
 *  The Launchpad form has no Algebra staircase: its Number rung speaks for the folded strand. */
export function crosswalk(rungs) {
  const eff = { ...rungs };
  if (typeof eff.algebra !== 'number' && typeof eff.number === 'number') eff.algebra = eff.number;
  const vals = STRANDS.map(k => eff[k]).filter(v => typeof v === 'number');
  if (vals.length && Math.min(...vals) < 2.5) return { node: 'explorer-0.1', launchpadGap: true, finaleDoor: false };
  const profiles = PLACEMENT_LOCK.crosswalk.entryProfiles;
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
    const profile = profiles[`explorer-${n}.1`] || {};
    const met = Object.entries(profile).every(([label, need]) => {
      const key = Object.keys(STRAND_LABELS).find(k => STRAND_LABELS[k] === label);
      return typeof eff[key] === 'number' && eff[key] >= need;
    });
    if (!met) return { node: `explorer-${n}.1`, launchpadGap: false, finaleDoor: false };
  }
  return { node: 'explorer-7.4', launchpadGap: false, finaleDoor: true };
}

/** One strand of the Starting Point note, in plain words: "solid to grade 4" when a whole rung confirmed,
 *  "grade 3, growing" for a half rung, kindergarten named, "worth a look" when the strand sits well below
 *  the student's best strand or under the Explorer starting line, and an honest line when the game ran out
 *  of questions before the strand settled. Never a score, never a percentage. */
export function strandNoteWords(label, placed, allRungs) {
  const { rung, confirmed } = placed;
  const gradeWords = r => (r <= 0 ? 'kindergarten' : `grade ${Math.floor(r)}`);
  let words;
  if (!confirmed) words = `${label}: starting around ${gradeWords(rung)} (the game ran out of questions before this one settled)`;
  else if (rung % 1) words = `${label}: ${gradeWords(rung)}, growing`;
  else words = `${label}: solid to ${gradeWords(rung)}`;
  const best = Math.max(...Object.values(allRungs));
  if (rung < 2.5 || best - rung >= 1.5) words += ', worth a look';
  return words;
}

/** The child's per-strand picture: one friendly card per strand visited — its icon, what kind of
 *  puzzle it was, and a paw for every puzzle the child actually tried in it. It shows the TOUR the
 *  child took, never a rung, a score or a judgement: effort and variety, the only things the game
 *  ever shows a child (spec §4.7). The rungs stay in the grown-up note alone. */
export const STRAND_PICTURE = Object.freeze({
  number: { icon: '🔢', line: 'You sorted big numbers and counting puzzles.' },
  algebra: { icon: '🔁', line: 'You spotted patterns and number tricks.' },
  'shape-measure': { icon: '📐', line: 'You measured, matched and built with shapes.' },
  'data-chance': { icon: '📊', line: 'You read charts and data puzzles.' },
});
export function strandPicture(state) {
  return Object.keys(state.strands).map(k => ({
    key: k, label: STRAND_LABELS[k], icon: STRAND_PICTURE[k].icon, line: STRAND_PICTURE[k].line,
    tried: state.strands[k].items,
  }));
}

/** A finished run's full result: placed rungs per strand, the start node, the child's workshop (a place,
 *  never a score) and the grown-up Starting Point note with its caveat. */
export function finishRun(state, { partial = false } = {}) {
  const rungs = {}, placed = {};
  for (const key of Object.keys(state.strands)) { placed[key] = placedRung(state.strands[key]); rungs[key] = placed[key].rung; }
  const { node, launchpadGap, finaleDoor } = crosswalk(rungs);
  const info = nodeInfo(node);
  const note = {
    lines: Object.keys(state.strands).map(k => strandNoteWords(STRAND_LABELS[k], placed[k], rungs)),
    placedUnit: finaleDoor
      ? `Past Unit 7: every strand pointed beyond the Explorer street's workshops. The start is the Vault of Measures, the finale at the end of Unit 7 (The Fairground), and every workshop stays open for games, laps and test-out.`
      : `Unit ${info.unit}: ${info.workshop}`,
    startNode: node, launchpadGap, finaleDoor: !!finaleDoor,
    launchpadLine: launchpadGap ? 'One or more strands landed below the Explorer starting line. The Launchpad gardens (kindergarten to grade 2) are still being built, so for now this learner starts at Welcome to the Numberworks, and this note flags the gap honestly rather than hiding it.' : null,
    partial: partial ? 'The game was stopped early. Strands place independently, so this start point still stands; a strand that had not settled starts at its seed rung.' : null,
    caveat: CAVEAT,
  };
  return { grade: state.grade, form: state.form, rungs, confirmed: Object.fromEntries(Object.entries(placed).map(([k, v]) => [k, v.confirmed])), startNode: node, workshop: info.workshop,
    // Past every workshop: the child hears the honest version too — the street is finished, every
    // workshop behind them is open, and the Vault of Measures at its end is where they start.
    finaleDoor: !!finaleDoor,
    finaleLine: finaleDoor ? `You raced to the very end of the street! Every workshop is open to you, and the Vault of Measures is waiting: seven locks, one for every workshop. You start at the Vault.` : null,
    note, picture: strandPicture(state) };
}

// ------------------------------------------------------------------------------------------------- persistence
const parse = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const rowOf = userId => q.get('SELECT * FROM nq_placement WHERE user_id=?', userId) || null;

export function getPlacement(user) {
  if (!user || !user.id || user.is_guest) return null; // guests store no placement or grade (addendum)
  const r = rowOf(user.id);
  if (!r) return null;
  return {
    // `grade` is the CURRENT grade, derived from the declaration (addendum): every consumer —
    // seeding, re-seeding, a grown-up's view — reads the derived value. The declaration itself
    // (declaredGrade + gradeDeclaredAt) rides along so a screen can say when it was named.
    grade: deriveGrade(r.grade, r.grade_declared_at), declaredGrade: r.grade, gradeDeclaredAt: r.grade_declared_at,
    rungs: parse(r.rungs, {}),
    // Rows saved before Phase 2 could name 'explorer-5.1' when it was still an unbuilt door the old
    // crosswalk pointed past; Unit 5 is built now, so the node reads as itself, the door those runs
    // were always aiming at. (Repair round 3 read such rows as Unit 4's door while 5.1 was unbuilt.)
    startNode: r.start_node, source: r.source,
    disabled: !!r.disabled, startFails: r.start_fails, softLandNode: r.soft_land_node, updatedAt: r.updated_at,
  };
}
/** Store a placement. The grade rule (addendum): passing a grade (a number, or null to clear) is a
 *  fresh declaration — it replaces the stored grade and resets the declaration date to today. Passing
 *  no grade keeps the standing declaration, unless `reanchorGrade` is set (a grown-up override): then
 *  the current derived grade becomes the stored grade and its clock restarts today. For a guest
 *  nothing is written at all: the placement is computed and returned for this sitting's screens only,
 *  marked `guest`, because a guest earns no stored placement or grade. */
function savePlacement(user, { grade, rungs, startNode, source, reanchorGrade = false }) {
  const t = now();
  const cur = user && user.id ? rowOf(user.id) : null;
  let declared = cur ? cur.grade : null, declaredAt = cur ? cur.grade_declared_at : null;
  if (grade !== undefined) { declared = grade; declaredAt = grade === null || grade === undefined ? null : t; }
  else if (reanchorGrade && cur) { declared = deriveGrade(cur.grade, cur.grade_declared_at, t); declaredAt = declared === null ? null : t; }
  if (!user || !user.id || user.is_guest) {
    return { grade: declared, declaredGrade: declared, gradeDeclaredAt: declaredAt, rungs: rungs || {},
      startNode, source, disabled: false, startFails: 0, softLandNode: null, updatedAt: t, guest: true };
  }
  q.run(`INSERT INTO nq_placement(user_id, course, grade, grade_declared_at, rungs, start_node, source, start_fails, soft_land_node, updated_at)
    VALUES (?,?,?,?,?,?,?,0,NULL,?) ON CONFLICT(user_id) DO UPDATE SET grade=excluded.grade, grade_declared_at=excluded.grade_declared_at, rungs=excluded.rungs,
    start_node=excluded.start_node, source=excluded.source, start_fails=0, soft_land_node=NULL, updated_at=excluded.updated_at`,
  user.id, COURSE_SLUG, declared, declaredAt, JSON.stringify(rungs || {}), startNode, source, t);
  return getPlacement(user);
}

/** The "Just Play" door (start from the very beginning, spec §4.1): no game; begin at the first unit of
 *  the tier matching the stated grade (Launchpad starters begin at the intro until that tier ships). */
export function placeAtBeginning(user, grade) {
  const g = seedGrade(grade);
  // Grades 6–8 would begin in the Pro tier, which is not built yet: they begin at the furthest built
  // workshop door, Unit 7's door, never at an unbuilt node. The finale door is NOT a beginning: the
  // Vault unlocks in course order, so a beginning start names Unit 7's first step, not 7.4.
  const node = g <= 2 ? 'explorer-0.1' : g <= 5 ? 'explorer-1.1' : 'explorer-7.1';
  return savePlacement(user, { grade: g, rungs: {}, startNode: node, source: 'beginning' });
}

/** Start a run (sorting game or test-out) and serve its first item. A retake re-seeds at the last placed
 *  rungs (spec §4.5). Refused while a grown-up has disabled the game for this student. */
export function startRun(user, { grade, kind = 'placement', unit = null } = {}) {
  if (!user || !user.id) return null;
  const existing = getPlacement(user);
  if (kind === 'placement' && existing && existing.disabled) return { disabled: true, placement: existing };
  const seed = uid();
  let state, current = null;
  if (kind === 'testout') {
    state = { kind, unit, seed, served: 0, correctCount: 0, items: testOutItems(unit, seed) };
    current = state.items[0] || null;
  } else {
    const retake = !!(existing && existing.startNode && existing.source !== 'beginning');
    // Seeding uses the derived current grade (addendum): a run that names a grade declares it; a run
    // that names none (the grown-up / not-sure door) re-seeds at the stored declaration's current
    // grade when there is one, and at the course's centre (grade 3) only when there is not.
    const named = grade === undefined || grade === null || grade === '' ? null : grade;
    const seedFrom = named !== null ? named : (existing && existing.grade !== null && existing.grade !== undefined ? existing.grade : 3);
    state = createRunState({ grade: seedFrom, seed, reseedRungs: retake ? existing.rungs : null });
    state.retake = retake;
    current = serveNext(state);
  }
  const id = uid();
  q.run('INSERT INTO nq_sort_runs(id, user_id, course, kind, unit, seed, state, current_item, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    id, user.id, COURSE_SLUG, kind, unit, seed, JSON.stringify(state), current ? JSON.stringify(current) : null, 'active', now(), now());
  return { runId: id, kind, unit, current: publicItem(current), state };
}
const publicItem = c => (c ? { strand: c.strand, strandLabel: c.strandLabel, audioFirst: !!c.audioFirst, ...(c.progress ? { progress: c.progress } : {}), item: c.item } : null);
const runRow = (user, runId) => (user && runId ? q.get('SELECT * FROM nq_sort_runs WHERE id=? AND user_id=? AND course=?', runId, user.id, COURSE_SLUG) : null);

/** Answer the item on screen. Returns the next item, or the run's result when it ends. A finished retake
 *  does NOT replace the placement yet: the result carries `pendingRetake` and only confirmRetake() applies
 *  it (spec §4.5). A first run applies at once. */
export function answerRun(user, runId, answer) {
  const row = runRow(user, runId);
  if (!row || row.status !== 'active' || !row.current_item) return null;
  const current = parse(row.current_item, null);
  const graded = gradeServed(current.templateId, current.itemSeed, answer || {});
  if (!graded) return null;
  const state = parse(row.state, null);
  let next = null, result = null;
  if (row.kind === 'testout') {
    state.served += 1;
    if (graded.correct) state.correctCount += 1;
    next = state.items[state.served] || null;
    if (!next) result = finishTestOut(user, row, state);
  } else {
    recordAnswer(state, current.strand, graded.correct);
    next = serveNext(state);
    if (!next) {
      const fin = finishRun(state);
      result = { ...fin, pendingRetake: !!state.retake };
      if (!state.retake) savePlacement(user, { grade: fin.grade, rungs: fin.rungs, startNode: fin.startNode, source: 'sorting-game' });
    }
  }
  q.run('UPDATE nq_sort_runs SET state=?, current_item=?, status=?, updated_at=? WHERE id=?',
    JSON.stringify(state), next ? JSON.stringify(next) : null, next ? 'active' : 'finished', now(), row.id);
  return { correct: graded.correct, next: publicItem(next), result, finished: !next };
}

/** The spoken text of the item a run is serving now, for the AI voice (routes/tts.js, ctx 'placement'):
 *  regenerated from the stored template + seed, exactly as grading re-derives the key, so the page
 *  never sends text and the voice reads only what the server itself dealt to this student's run. A
 *  finished run, another student's run and a run id that never existed all have nothing to say (null).
 *  The item's spokenPrompt (the generator's audio-first wording) wins over its printed prompt. */
export function currentSpoken(user, runId) {
  const row = runRow(user, runId);
  if (!row || row.status !== 'active' || !row.current_item) return null;
  const current = parse(row.current_item, null);
  if (!current || !current.templateId || !current.itemSeed) return null;
  const template = TEMPLATES.find(t => t.id === current.templateId);
  if (!template) return null;
  const full = generateItem(template, current.itemSeed);
  return full.spokenPrompt || full.prompt || null;
}

/** "Stop and start playing" (spec §4.2): a partial run still places — strands place independently and an
 *  unsettled strand starts at its seed rung. Same retake rule as a finished run. */
export function finishEarly(user, runId) {
  const row = runRow(user, runId);
  if (!row || row.status !== 'active' || row.kind !== 'placement') return null;
  const state = parse(row.state, null);
  const fin = finishRun(state, { partial: true });
  if (!state.retake) savePlacement(user, { grade: fin.grade, rungs: fin.rungs, startNode: fin.startNode, source: 'sorting-game' });
  q.run("UPDATE nq_sort_runs SET status='finished', current_item=NULL, updated_at=? WHERE id=?", now(), row.id);
  return { ...fin, pendingRetake: !!state.retake };
}

/** Apply a finished retake's result (and only then does it replace the standing placement). */
export function confirmRetake(user, runId) {
  const row = runRow(user, runId);
  if (!row || row.status !== 'finished' || row.kind !== 'placement') return null;
  const fin = finishRun(parse(row.state, null));
  return savePlacement(user, { grade: fin.grade, rungs: fin.rungs, startNode: fin.startNode, source: 'retake' });
}
/** Keep the standing placement and drop the retake's claim (the run row stays as history). */
export function keepOriginal(user) { return getPlacement(user); }

// ------------------------------------------------------------------------------------------------- overrides (§4.5)
/** Teacher/parent override is absolute: set any start node. Returns the placement, or null for a node the
 *  path does not have. The rungs stand (they are history); the source says a grown-up chose. The grade
 *  is re-anchored (addendum): an override replaces the stored grade with the current derived grade and
 *  resets its declaration date, so the clock restarts from the grown-up's word. */
export function overrideStartNode(user, node) {
  if (!user || !user.id || !START_NODES.some(n => n.node === node)) return null;
  const cur = getPlacement(user) || { grade: null, rungs: {} };
  return savePlacement(user, { rungs: cur.rungs, startNode: node, source: 'override', reanchorGrade: true });
}
/** Disable (or re-enable) the Sorting Game for a student: while disabled, no run starts and the standing
 *  start node is simply where they play. */
export function setPlacementDisabled(user, disabled) {
  if (!user || !user.id) return null;
  if (!rowOf(user.id)) savePlacement(user, { grade: null, rungs: {}, startNode: 'explorer-0.1', source: 'override' });
  q.run('UPDATE nq_placement SET disabled=?, updated_at=? WHERE user_id=?', disabled ? 1 : 0, now(), user.id);
  return getPlacement(user);
}

// ------------------------------------------------------------------------------------------------- soft landing (§4.4)
/** Record a check result at the placed start. Failing the first two checks there quietly offers the
 *  previous unit first ("Tally suggests warming up here") — no error state, no failure record; the
 *  placement itself does not move, and passing any check at the start clears the count. */
export function recordStartCheck(user, stepKey, passed) {
  const p = getPlacement(user);
  if (!p || !p.startNode) return null;
  const unitOf = k => { const m = /^explorer-(\d)\.\d$/.exec(String(k || '')); return m ? +m[1] : null; };
  if (unitOf(stepKey) === null || unitOf(stepKey) !== unitOf(p.startNode)) return p;
  if (passed) {
    if (p.startFails || p.softLandNode) q.run('UPDATE nq_placement SET start_fails=0, soft_land_node=NULL, updated_at=? WHERE user_id=?', now(), user.id);
    return getPlacement(user);
  }
  const fails = p.startFails + 1;
  const prev = Math.max(0, unitOf(p.startNode) - 1);
  const soft = fails >= 2 && unitOf(p.startNode) > 0 ? `explorer-${prev}.1` : p.softLandNode;
  q.run('UPDATE nq_placement SET start_fails=?, soft_land_node=?, updated_at=? WHERE user_id=?', fails, soft, now(), user.id);
  return getPlacement(user);
}

// ------------------------------------------------------------------------------------------------- test-out (§4.6)
/** The 5 test-out items for a unit: one per strand at the rung the crosswalk asks of that unit's door,
 *  plus a second Number item (the strand every unit leans on hardest). Deterministic in the seed; the
 *  public shape hides the keys exactly as the Sorting Game does. Any unit with a locked entry profile
 *  can be tested out of — Units 1–7 since the Phase 2 lock; the finale has no profile and no test-out. */
export function testOutItems(unit, seed = 'testout') {
  const profile = (PLACEMENT_LOCK.crosswalk.entryProfiles || {})[`explorer-${unit}.1`];
  if (!profile) return [];
  const picks = [];
  const seen = new Set(); // no verbatim repeats inside one test-out either (repair round 3)
  const take = (strandKey, rung, salt) => {
    const pool = TEMPLATES.filter(t => t.strand === strandKey && t.rung === rung);
    if (!pool.length) return;
    const rng = rngFromSeed(`${seed}:testout:${unit}:${salt}`);
    const template = pool[Math.floor(rng() * pool.length)];
    let itemSeed = `${seed}:testout:${unit}:${salt}:${template.id}`;
    let full = generateItem(template, itemSeed);
    for (let retry = 1; retry <= 6 && seen.has(`${full.prompt} => ${full.answer}`); retry++) {
      itemSeed = `${seed}:testout:${unit}:${salt}:r${retry}:${template.id}`;
      full = generateItem(template, itemSeed);
    }
    seen.add(`${full.prompt} => ${full.answer}`);
    picks.push({
      strand: strandKey, strandLabel: STRAND_LABELS[strandKey], templateId: template.id, itemSeed, audioFirst: !!template.audioFirst,
      item: { prompt: full.prompt, spokenPrompt: full.spokenPrompt, responseType: full.responseType, ...(full.manip ? { manip: full.manip } : {}), choices: full.choices ? full.choices.map(c => ({ value: c.value })) : null },
    });
  };
  for (const [label, rung] of Object.entries(profile)) {
    const key = Object.keys(STRAND_LABELS).find(k => STRAND_LABELS[k] === label);
    if (key) take(key, rung, key);
  }
  take('number', profile.Number ?? 3.5, 'number-2');
  return picks.slice(0, TESTOUT_ITEMS);
}
function finishTestOut(user, row, state) {
  const passed = state.correctCount >= TESTOUT_PASS;
  let marks = { awarded: false, marks: 0, total: NQ.totalMarks(user, COURSE) };
  if (passed && !user.is_guest) { // a guest's pass is applauded, never recorded (addendum)
    q.run('INSERT OR IGNORE INTO nq_testout(user_id, course, tier, unit, passed_at) VALUES (?,?,?,?,?)', user.id, COURSE_SLUG, 'explorer', row.unit, now());
    marks = NQ.awardTestOutPassed(user, COURSE, 'explorer', row.unit);
  }
  return { kind: 'testout', unit: row.unit, passed, correctCount: state.correctCount, needed: TESTOUT_PASS,
    stoneEarned: false, marks,
    words: passed ? 'You showed Tally you know this unit. Its stone is still earned by doing the unit\u2019s mission: that rule never bends.' : 'Not yet. The unit stays right here to play through, and you can try again another day.' };
}
// A school account merged into a student's own account brings its placement with it (the student's own
// row wins, as with the progress layer); test-outs merge, in-flight runs stay with the old account.
onAccountMerge(({ from, into }) => {
  q.run('UPDATE OR IGNORE nq_placement SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM nq_placement WHERE user_id=?', from);
  q.run('UPDATE OR IGNORE nq_testout SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM nq_testout WHERE user_id=?', from);
});

/** Units this student has tested out of (explorer tier, Phase 1): [unit numbers]. */
export function testedOutUnits(user) {
  if (!user || !user.id) return [];
  return q.all('SELECT unit FROM nq_testout WHERE user_id=? AND course=? ORDER BY unit', user.id, COURSE_SLUG).map(r => r.unit);
}
