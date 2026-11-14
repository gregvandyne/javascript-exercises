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
import { TEMPLATES, BY_ID, generateItem, rngFromSeed } from '../../seed-lessons/number-quest/placement/generator.js';
import * as NQ from './number-quest-progress.js';
import * as T from './number-quest-tiers.js';
import { onAccountMerge } from './schools.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const PLACEMENT_LOCK = readJson('seed-lessons/number-quest/placement.json');

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
  // BY_ID, not the served bank: an item dealt from a template that has since been retired is still graded
  // by the key it was dealt with (a run in flight when the bank changed loses nothing).
  const template = BY_ID.get(templateId);
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
// Everything below reads the path from the catalogue (services/number-quest-tiers.js): which tiers are open,
// their units, their doors. No node name is spelled here, so a tier that opens (Launchpad, then Pro) joins
// the placement walk by its data alone — its units in units.json, its entry profiles in placement.json
// (crosswalk.entryProfiles, keyed "<tier>-<unit>.1").
const profilesLock = () => (PLACEMENT_LOCK.crosswalk && PLACEMENT_LOCK.crosswalk.entryProfiles) || {};
let profileOverrides = null;
/** FOR TESTS ONLY: read these entry profiles on top of the locked ones (null restores the lock alone).
 *  Nothing in the app calls this: a tier's profiles are locked for real in placement.json. */
export function setEntryProfilesForTests(extra) { profileOverrides = extra && typeof extra === 'object' ? { ...extra } : null; }
const entryProfiles = () => (profileOverrides ? { ...profilesLock(), ...profileOverrides } : profilesLock());
/** A unit's locked entry profile ({ strand label: rung }), or null: the key is its door, "<tier>-<n>.1". */
export const entryProfile = (tier, unit) => entryProfiles()[`${tier}-${unit}.1`] || null;
/** A tier's units that have an entry profile, in path order: the units the walk (and test-out) can name. */
const profiledUnits = tier => T.unitsOf(tier).filter(u => entryProfile(tier, u.n));
/** May placement land a learner in this tier? Only an OPEN tier: a tier that is not open is nobody's start. */
const placeable = tier => T.isOpen(tier);
/** A tier's finale door (units.json tiers.<tier>.finale, a step number): where a run that meets every
 *  profile of the tier lands. Null for a tier without one. */
function finaleOf(tier) {
  const n = (T.tierInfo(tier) || {}).finale;
  const hit = n ? T.stepsOf(tier).find(x => x.n === n) : null;
  return hit ? { node: hit.key, unit: hit.unit.n, workshop: T.stepTitle(tier, hit.s) } : null;
}
/** Every start node the game (or an override) can name, in path order: each open tier's unit doors (a
 *  unit's first step), then the tier's finale door when it has one (Explorer's explorer-7.4, the Vault of
 *  Measures, where a run lands when its strands meet every unit's entry profile). Only BUILT workshops of
 *  OPEN tiers are nameable: a start node is a place a child can actually open. It never names an unbuilt
 *  node, and never shows a child a fallback label in place of a workshop. */
export function startNodes() {
  const out = [];
  for (const tier of T.openTiers()) {
    for (const u of T.unitsOf(tier)) {
      const node = T.doorOf(tier, u);
      if (node) out.push(Object.freeze({ node, tier, unit: u.n, workshop: u.title, built: true }));
    }
    const fin = finaleOf(tier);
    if (fin) out.push(Object.freeze({ ...fin, tier, built: true, finale: true }));
  }
  return out;
}
/** The same list as a live, read-only array (startNodes() read afresh on every use, so it follows the
 *  catalogue): kept for the callers that knew it as a constant. */
export const START_NODES = new Proxy([], {
  get: (_, k) => { const now_ = startNodes(); const v = now_[k]; return typeof v === 'function' ? v.bind(now_) : v; },
  has: (_, k) => k in startNodes(),
  set: () => false, deleteProperty: () => false,
});
/** The path's fallback node: the Explorer street's first step (Welcome to the Numberworks), else the first
 *  node there is. A stored node that names no workshop reads as this one. */
const homeNode = () => { const all = startNodes(); return all.find(x => x.node === T.firstKey(T.DEFAULT_TIER)) || all[0]; };
export const nodeInfo = node => startNodes().find(x => x.node === node) || homeNode();
/** A tier's first node as a string (its welcome), for the places that only need the name. */
const firstNode = tier => T.firstKey(tier) || homeNode().node;
const strandKeyOf = label => Object.keys(STRAND_LABELS).find(k => STRAND_LABELS[k] === label);
const profileMet = (profile, eff) => Object.entries(profile).every(([label, need]) => {
  const key = strandKeyOf(label);
  return typeof eff[key] === 'number' && eff[key] >= need;
});
/** The rung under which a learner belongs to the Launchpad tier (the Explorer starting line, spec §4.4). */
export const EXPLORER_LINE = 2.5;

/** The locked crosswalk (placement.json): the start node is the first unit whose entry profile the four
 *  placed rungs do not fully meet — a near-miss counts as not met, so ties resolve to the LOWER unit.
 *  - Explorer (always walked for rungs at or over the line): Units 1-7 in order. All seven met → the strands
 *    point past every workshop: with no Pro tier open, the start is the finale door (explorer-7.4, the Vault
 *    of Measures) and `finaleDoor` rides along so the child and the grown-up note can both say the street is
 *    finished and the Vault is waiting.
 *  - Any rung below 2.5 puts the start in the Launchpad tier (open since 2026-11-13, with profiles keyed
 *    "launchpad-<n>.1"): its units are walked the same way: below its first profile → the tier's very
 *    first step (its welcome); otherwise the first unit whose profile is not met; every Launchpad profile
 *    met → the Explorer intro, with no gap (never the Launchpad finale: the Garden Gate is a review door a
 *    learner walks to, not a start). Should Launchpad ever be closed again (or lose its profiles), the
 *    learner starts at the Explorer intro and the note flags the gap (`launchpadGap`).
 *  - Pro, once open with profiles (keys "pro-<n>.1"), continues the walk after Explorer's seven: below its
 *    first profile → Pro's first step; else its first unmet unit; all met → Pro's finale door when it has
 *    one, else its last unit's door.
 *  `tier` names the street the node sits on.
 *  The Launchpad form has no Algebra staircase: its Number rung speaks for the folded strand. */
export function crosswalk(rungs) {
  const eff = { ...rungs };
  if (typeof eff.algebra !== 'number' && typeof eff.number === 'number') eff.algebra = eff.number;
  const vals = STRANDS.map(k => eff[k]).filter(v => typeof v === 'number');
  const at = (node, extra = {}) => ({ node, tier: (T.parseKey(node) || {}).tier || T.DEFAULT_TIER, launchpadGap: false, finaleDoor: false, ...extra });
  /** Walk one tier's profiled units: the first unmet unit's node, or null when every profile is met. */
  const walk = (tier, { belowFirst }) => {
    const units = profiledUnits(tier);
    for (const [i, u] of units.entries()) {
      if (!profileMet(entryProfile(tier, u.n), eff)) return i === 0 && belowFirst ? firstNode(tier) : T.doorOf(tier, u);
    }
    return null;
  };
  if (vals.length && Math.min(...vals) < EXPLORER_LINE) {
    if (!placeable('launchpad') || !profiledUnits('launchpad').length) return at(firstNode('explorer'), { launchpadGap: true });
    return at(walk('launchpad', { belowFirst: true }) || firstNode('explorer'));
  }
  // Explorer's own walk is exactly the locked rule: a miss at Unit 1's profile names Unit 1's door.
  const inExplorer = walk('explorer', { belowFirst: false });
  if (inExplorer) return at(inExplorer);
  if (placeable('pro') && profiledUnits('pro').length) {
    const inPro = walk('pro', { belowFirst: true });
    if (inPro) return at(inPro);
    const fin = finaleOf('pro'), units = T.unitsOf('pro');
    return at(fin ? fin.node : T.doorOf('pro', units[units.length - 1]), { finaleDoor: !!fin });
  }
  const fin = finaleOf('explorer');
  if (fin) return at(fin.node, { finaleDoor: true });
  const units = T.unitsOf('explorer');
  return at(T.doorOf('explorer', units[units.length - 1]));
}
/** How a start node's unit reads on the grown-up note: "Unit 3: Groups & Shares" on the Explorer street
 *  (as it always has), with the street named first on any other ("Launchpad · Unit 1: ..."). */
export function placedUnitWords(node) {
  const info = nodeInfo(node);
  const unit = `Unit ${info.unit}: ${info.workshop}`;
  return info.tier === T.DEFAULT_TIER ? unit : `${T.tierName(info.tier)} · ${info.unit === 0 ? info.workshop : unit}`;
}
/** The grown-up note's line for a run that met every profile and starts at a finale door. Explorer's is
 *  its own locked copy (the Vault of Measures); another tier's finale reads from the catalogue. */
export function finaleWords(node) {
  const info = nodeInfo(node);
  if (info.tier === T.DEFAULT_TIER) return `Past Unit 7: every strand pointed beyond the Explorer street's workshops. The start is the Vault of Measures, the finale at the end of Unit 7 (The Fairground), and every workshop stays open for games, laps and test-out.`;
  return `Past the last unit: every strand pointed beyond the ${T.tierName(info.tier)} street's workshops. The start is ${info.workshop}, the finale at the end of the street, and every workshop stays open for games, laps and test-out.`;
}
/** The child's line for the same landing: the street is finished and its last door is where they start. */
export function finaleLineFor(node) {
  const info = nodeInfo(node);
  if (info.tier === T.DEFAULT_TIER) return `You raced to the very end of the street! Every workshop is open to you, and the Vault of Measures is waiting: seven locks, one for every workshop. You start at the Vault.`;
  return `You raced to the very end of the street! Every workshop is open to you, and ${info.workshop} is waiting. That is where you start.`;
}

/** The grown-up note's line about the Explorer starting line, or null when no strand sits under it. It is
 *  worked out from the rungs and the start node the note is about, so the note a run writes and the note
 *  rebuilt later from the stored row (routes/number-quest.js) say the same thing:
 *  - the start is in the Launchpad gardens: no extra line, the placed unit already names the garden;
 *  - the rungs point into the gardens but the stored start is elsewhere (a start set before the gardens
 *    opened on 2026-11-13, when such runs began at the Explorer welcome): say where the game would start
 *    them now, and that nothing has been moved. A learner is never moved by the tier opening: only a
 *    confirmed retake or a grown-up's override changes a stored start. A grown-up's own choice
 *    (`source` 'override') gets no such line: their word stands without comment;
 *  - every garden's profile is met but a rung is still under the line: the Explorer welcome, said plainly;
 *  - Launchpad is not open to placement: the old gap line, flagged honestly. */
export function launchpadNoteLine(rungs, startNode, source = 'sorting-game') {
  const cw = crosswalk(rungs || {});
  const vals = Object.values(rungs || {}).filter(v => typeof v === 'number');
  if (!vals.length || Math.min(...vals) >= EXPLORER_LINE) return null;
  const gardens = T.tierName('launchpad');
  if (cw.launchpadGap) return `One or more strands landed below the Explorer starting line. The ${gardens} gardens (kindergarten to grade 2) are not open for placement, so this learner starts at ${nodeInfo(firstNode('explorer')).workshop}, and this note flags the gap honestly rather than hiding it.`;
  const stored = (T.parseKey(startNode) || {}).tier || T.DEFAULT_TIER;
  if (cw.tier === 'launchpad') {
    if (stored === 'launchpad' || source === 'override') return null;
    return `One or more strands sit below the Explorer starting line. This start point was set before the ${gardens} gardens (kindergarten to grade 2) opened; on the same answers the Sorting Game would now start this learner at ${placedUnitWords(cw.node)}. Nothing has been moved and no progress has changed: use the override on this page, or let the learner replay the Sorting Game, if you would like the start to change.`;
  }
  return `One or more strands landed just below the Explorer starting line, and every ${gardens} garden's entry profile was met, so the start is ${nodeInfo(cw.node).workshop} on the Explorer street. The ${gardens} gardens stay open behind it for games and review.`;
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
  const { node, tier, launchpadGap, finaleDoor } = crosswalk(rungs);
  const info = nodeInfo(node);
  const note = {
    lines: Object.keys(state.strands).map(k => strandNoteWords(STRAND_LABELS[k], placed[k], rungs)),
    placedUnit: finaleDoor ? finaleWords(node) : placedUnitWords(node),
    startNode: node, tier, launchpadGap, finaleDoor: !!finaleDoor,
    launchpadLine: launchpadNoteLine(rungs, node),
    partial: partial ? 'The game was stopped early. Strands place independently, so this start point still stands; a strand that had not settled starts at its seed rung.' : null,
    caveat: CAVEAT,
  };
  return { grade: state.grade, form: state.form, rungs, confirmed: Object.fromEntries(Object.entries(placed).map(([k, v]) => [k, v.confirmed])), startNode: node, tier, workshop: info.workshop,
    // Past every workshop: the child hears the honest version too — the street is finished, every
    // workshop behind them is open, and the Vault of Measures at its end is where they start.
    finaleDoor: !!finaleDoor,
    finaleLine: finaleDoor ? finaleLineFor(node) : null,
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

/** Where a stated grade begins without a game: the first unit of the tier matching the grade.
 *  - K-2: the Launchpad tier's first step (Meet Tally in the Gardens); the Explorer intro if that tier
 *    is not open.
 *  - 3-5: Explorer's first workshop (Unit 1's door: the intro is a welcome, not a unit).
 *  - 6-8: the Pro tier's first step once that tier is open; until then the furthest built Explorer
 *    workshop door (Unit 7's door), never an unbuilt node. The finale door is NOT a beginning: the Vault
 *    unlocks in course order, so a beginning start names the last unit's first step, not the finale. */
export function beginningNode(grade) {
  const g = seedGrade(grade);
  const explorer = T.unitsOf('explorer');
  if (g <= 2) return placeable('launchpad') ? firstNode('launchpad') : firstNode('explorer');
  if (g <= 5) return T.doorOf('explorer', explorer.find(u => u.n >= 1) || explorer[0]);
  return placeable('pro') ? firstNode('pro') : T.doorOf('explorer', explorer[explorer.length - 1]);
}
/** The "Just Play" door (start from the very beginning, spec §4.1): no game; begin at the first unit of
 *  the tier matching the stated grade (see beginningNode). */
export function placeAtBeginning(user, grade) {
  const g = seedGrade(grade);
  return savePlacement(user, { grade: g, rungs: {}, startNode: beginningNode(g), source: 'beginning' });
}

/** Start a run (sorting game or test-out) and serve its first item. A retake re-seeds at the last placed
 *  rungs (spec §4.5). Refused while a grown-up has disabled the game for this student. */
export function startRun(user, { grade, kind = 'placement', unit = null, tier = T.DEFAULT_TIER } = {}) {
  if (!user || !user.id) return null;
  const existing = getPlacement(user);
  if (kind === 'placement' && existing && existing.disabled) return { disabled: true, placement: existing };
  const seed = uid();
  let state, current = null;
  if (kind === 'testout') {
    state = { kind, unit, tier, seed, served: 0, correctCount: 0, items: testOutItems(unit, seed, tier) };
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
  return { runId: id, kind, unit, ...(kind === 'testout' ? { tier } : {}), current: publicItem(current), state };
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
  const template = BY_ID.get(current.templateId); // served or retired: the item on screen is the one read aloud
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
  if (!user || !user.id || !startNodes().some(n => n.node === node)) return null;
  const cur = getPlacement(user) || { grade: null, rungs: {} };
  return savePlacement(user, { rungs: cur.rungs, startNode: node, source: 'override', reanchorGrade: true });
}
/** Disable (or re-enable) the Sorting Game for a student: while disabled, no run starts and the standing
 *  start node is simply where they play. */
export function setPlacementDisabled(user, disabled) {
  if (!user || !user.id) return null;
  if (!rowOf(user.id)) savePlacement(user, { grade: null, rungs: {}, startNode: firstNode('explorer'), source: 'override' });
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
  // The rule reads checks in the placed start's own unit: same tier AND same unit number (Launchpad
  // Unit 1 is not Explorer Unit 1).
  const step = T.parseKey(stepKey), start = T.parseKey(p.startNode);
  if (!step || !start || step.tier !== start.tier || step.unit !== start.unit) return p;
  if (passed) {
    if (p.startFails || p.softLandNode) q.run('UPDATE nq_placement SET start_fails=0, soft_land_node=NULL, updated_at=? WHERE user_id=?', now(), user.id);
    return getPlacement(user);
  }
  const fails = p.startFails + 1;
  // The warm-up is the unit before the start on the same street; a street's first unit has none.
  const units = T.unitsOf(start.tier), i = units.findIndex(u => u.n === start.unit);
  const soft = fails >= 2 && i > 0 ? T.doorOf(start.tier, units[i - 1]) : p.softLandNode;
  q.run('UPDATE nq_placement SET start_fails=?, soft_land_node=?, updated_at=? WHERE user_id=?', fails, soft, now(), user.id);
  return getPlacement(user);
}

// ------------------------------------------------------------------------------------------------- test-out (§4.6)
/** The 5 test-out items for a unit: one per strand at the rung the crosswalk asks of that unit's door,
 *  plus a second Number item (the strand every unit leans on hardest). Deterministic in the seed; the
 *  public shape hides the keys exactly as the Sorting Game does. Any unit with a locked entry profile
 *  can be tested out of — Explorer Units 1–7 since the Phase 2 lock; the finale has no profile and no
 *  test-out. `tier` names the street (Explorer unless said): a unit is tier + number, so Launchpad Unit 2
 *  and Explorer Unit 2 deal different items from different profiles. */
export function testOutItems(unit, seed = 'testout', tier = T.DEFAULT_TIER) {
  const profile = T.exists(tier) ? entryProfile(tier, unit) : null;
  if (!profile) return [];
  // Explorer's seeds are spelled as they always were (the same seed deals the same items as before the
  // tiers); any other tier salts its own name in, so two tiers never deal one unit's items.
  const unitSeed = tier === T.DEFAULT_TIER ? `${unit}` : `${tier}-${unit}`;
  const picks = [];
  const seen = new Set(); // no verbatim repeats inside one test-out either (repair round 3)
  const take = (strandKey, rung, salt) => {
    const pool = TEMPLATES.filter(t => t.strand === strandKey && t.rung === rung);
    if (!pool.length) return;
    const rng = rngFromSeed(`${seed}:testout:${unitSeed}:${salt}`);
    const template = pool[Math.floor(rng() * pool.length)];
    let itemSeed = `${seed}:testout:${unitSeed}:${salt}:${template.id}`;
    let full = generateItem(template, itemSeed);
    for (let retry = 1; retry <= 6 && seen.has(`${full.prompt} => ${full.answer}`); retry++) {
      itemSeed = `${seed}:testout:${unitSeed}:${salt}:r${retry}:${template.id}`;
      full = generateItem(template, itemSeed);
    }
    seen.add(`${full.prompt} => ${full.answer}`);
    picks.push({
      strand: strandKey, strandLabel: STRAND_LABELS[strandKey], templateId: template.id, itemSeed, audioFirst: !!template.audioFirst,
      item: { prompt: full.prompt, spokenPrompt: full.spokenPrompt, responseType: full.responseType, ...(full.manip ? { manip: full.manip } : {}), choices: full.choices ? full.choices.map(c => ({ value: c.value })) : null },
    });
  };
  for (const [label, rung] of Object.entries(profile)) {
    const key = strandKeyOf(label);
    if (key) take(key, rung, key);
  }
  take('number', profile.Number ?? 3.5, 'number-2');
  return picks.slice(0, TESTOUT_ITEMS);
}
function finishTestOut(user, row, state) {
  const passed = state.correctCount >= TESTOUT_PASS;
  const tier = T.TIERS.includes(state.tier) ? state.tier : T.DEFAULT_TIER; // runs saved before the tiers carry none
  let marks = { awarded: false, marks: 0, total: NQ.totalMarks(user, COURSE) };
  if (passed && !user.is_guest) { // a guest's pass is applauded, never recorded (addendum)
    q.run('INSERT OR IGNORE INTO nq_testout(user_id, course, tier, unit, passed_at) VALUES (?,?,?,?,?)', user.id, COURSE_SLUG, tier, row.unit, now());
    marks = NQ.awardTestOutPassed(user, COURSE, tier, row.unit);
  }
  return { kind: 'testout', tier, unit: row.unit, passed, correctCount: state.correctCount, needed: TESTOUT_PASS,
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

/** Units of one tier this student has tested out of (the Explorer street unless a tier is named):
 *  [unit numbers]. Test-outs are stored per tier, so one tier's Unit 2 never reads as another's. */
export function testedOutUnits(user, tier = T.DEFAULT_TIER) {
  if (!user || !user.id) return [];
  return q.all('SELECT unit FROM nq_testout WHERE user_id=? AND course=? AND tier=? ORDER BY unit', user.id, COURSE_SLUG, tier).map(r => r.unit);
}
