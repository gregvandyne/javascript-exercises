// What "nothing below rung 6 changed" means, as two hashes (used by tests/unit/number-quest-placement-pro.test.js).
// Both are computed from whatever generator / placement service they are handed, so the same code can be run
// against an older checkout to produce the pinned values.
import crypto from 'node:crypto';

const sha = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const SUB6_SEEDS = 40;

/** Every template below rung 6, in bank order, with every field it carries, and the complete item it deals for
 *  seeds 1..40 (prompt, spoken prompt, key, choices in their shuffled order, tags, hands-on counters). */
export function sub6BankHash({ TEMPLATES, generateItem }) {
  const low = TEMPLATES.filter(t => t.rung < 6);
  return { templates: low.length, hash: sha(low.map(t => [t, Array.from({ length: SUB6_SEEDS }, (_, i) => generateItem(t, i + 1))])) };
}

/** Whole Sorting Game runs for learners whose answers are right up to an ability rung under 6 and wrong above it:
 *  every named grade K-8, every ability K.0-5.5, three seeds (324 runs). Two things are hashed:
 *  - `outcomes`: for EVERY run, where each strand was at each question (strand and rung), and the result: placed
 *    rungs, which were confirmed, the start node, the street, the workshop and the whole grown-up note;
 *  - `below`: for every run that never meets an item at rung 6 or over, the whole game as served, item by item
 *    (template, seed, prompt, choices, hands-on counters): a learner who stays under rung 6 plays the same game.
 *  A run that does climb to rung 6 is dealt different items there (that is the change), and the game's
 *  no-repeat rule may then pick a different sub-6 template once where the old rung 6 item was a verbatim copy of
 *  it; its outcome is pinned all the same. */
export function sub6RunsHash(P, { TEMPLATES }) {
  const rungOf = new Map(TEMPLATES.map(t => [t.id, t.rung]));
  const outcomes = [], below = [];
  for (const grade of ['K', 1, 2, 3, 4, 5, 6, 7, 8]) for (let ability = 0; ability <= 5.5; ability += 0.5) for (const seed of ['pin-a', 'pin-b', 'pin-c']) {
    const state = P.createRunState({ grade, seed: `${seed}:${grade}:${ability}` });
    const walk = [], served = [];
    for (let guard = 0; guard < 60 && !P.runFinished(state); guard++) {
      const it = P.serveNext(state); if (!it) break;
      const rung = rungOf.get(it.templateId);
      walk.push([it.strand, rung]); served.push([it.strand, it.templateId, it.itemSeed, it.audioFirst, it.progress, it.item]);
      P.recordAnswer(state, it.strand, rung <= ability);
    }
    const fin = P.finishRun(state);
    outcomes.push([grade, ability, seed, walk, fin.rungs, fin.confirmed, fin.startNode, fin.tier, fin.workshop, fin.finaleDoor, fin.finaleLine, fin.note]);
    if (walk.every(w => w[1] < 6)) below.push([grade, ability, seed, served]);
  }
  return { runs: outcomes.length, outcomes: sha(outcomes), belowRuns: below.length, below: sha(below) };
}

/** Where EVERY possible set of placed rungs starts, today: all 17 rungs in each of the four strands (83,521 sets),
 *  then the short K-2 form's three strands (4,913 sets), each through the locked crosswalk; and where "Just Play"
 *  starts for each named grade. A tier that is recorded but not open must change none of it. */
export function crosswalkHash(P) {
  const R = Array.from({ length: 17 }, (_, i) => i / 2), out = [];
  for (const n of R) for (const a of R) for (const s of R) for (const d of R) { const c = P.crosswalk({ number: n, algebra: a, 'shape-measure': s, 'data-chance': d }); out.push(`${c.node}|${c.tier}|${+c.launchpadGap}|${+c.finaleDoor}`); }
  for (const n of R) for (const s of R) for (const d of R) { const c = P.crosswalk({ number: n, 'shape-measure': s, 'data-chance': d }); out.push(`${c.node}|${c.tier}|${+c.launchpadGap}|${+c.finaleDoor}`); }
  const begin = ['K', 1, 2, 3, 4, 5, 6, 7, 8].map(g => P.beginningNode(g));
  return { sets: out.length, hash: crypto.createHash('sha256').update(out.join('\n')).digest('hex'), nodes: [...new Set(out.map(x => x.split('|')[0]))].sort(), begin, startNodes: P.startNodes().map(x => x.node) };
}
