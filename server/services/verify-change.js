// Check the work after every change (docs/decisions.md "Builders check their work: verify after every change"). The
// owner, 25 Nov 2026: Oomba said it had replaced question 1 with a multiple-choice question while the screen still
// showed the old area question, twice. "It needs to check its work and confirm on the screen that it has done what it
// said it has first." The rule, shared by every AI builder that changes something:
//
// 1. A change is checked by reading back what it actually made, never by what was asked for. A page tool (Figures'
//    editWorksheet, Manipulatives' changeBoard) writes the change in a DRY RUN (dryRun: the same write inside a
//    transaction that is rolled back), reads the result back as the page shows it, and gives THAT to the AI as the tool's
//    result: what landed (each question as it now reads), what did not land and why (a figure that cannot be drawn, a
//    question that is not there, a filter), what landed other than asked (a repair).
// 2. The AI is told (RULE, in the surface's system prompt and the tool's result) to say only what landed, to say plainly
//    what did not and why, and to offer to try again.
// 3. The real write happens with Oomba's reply (the engine's one transaction) and is read back again. When it differs
//    from what the AI was told (the teacher edited the page meanwhile), the reply gets the app's own correction
//    (correction()), and the turn's card shows the truth either way: what changed, and what did not with the reason.
// 4. Builders without a page tool (the drafts of Crossword, Word Hunt, Atlas Quest, Mistake Hunt, the Builder's saved
//    versions) report the same way with kept(): "12 of 15 words kept, 3 removed by the filter".
import { db } from '../db.js';

/** The system-prompt rule every builder that changes something gets (a surface's own prompt, never the arcade
 *  Builder's pinned SYSTEM_PROMPT). */
export const RULE = 'Check your work. A tool that changes something answers with what actually landed, read back after the change: "landed" (as it now shows), "notLanded" (with why), and what landed other than asked. Tell the teacher only what is under landed. If anything is under notLanded or landed other than asked, say so plainly in a few words with the reason, and offer to try again (or fix it now with another call). Never say something is done, changed or fixed unless the tool result shows it landed.';
/** The same, for one tool result (its note). */
export const NOTE = 'This is what is on the teacher\'s screen after the change, read back. Say only what is under landed; say plainly what is under notLanded and why, and offer to try again.';

const ROLLBACK = Symbol('dry run');
/** fn() inside a transaction that is always rolled back: what a write WOULD make, read back, with nothing kept.
 *  better-sqlite3 nests it as a savepoint inside an open transaction. -> fn's result */
export function dryRun(fn) {
  let out;
  try { db.transaction(() => { out = fn(); throw ROLLBACK; })(); } catch (e) { if (e !== ROLLBACK) throw e; }
  return out;
}

/** What the AI was told landed vs what landed when it was written for real: a short correction for the reply, or ''. */
export function correction(told, final, { lost = 'Some of that did not change after all: the page changed while I was working. The card below shows what did.', none = 'Nothing changed after all: the page changed while I was working. Please try again.' } = {}) {
  if (!told || !final) return '';
  const key = v => JSON.stringify((v.landed || []).map(x => x.now ? { ...x.now, n: 0 } : x));
  if (key(told) === key(final)) return '';
  return final.landed && final.landed.length ? lost : none;
}

/** Drafted items after the checks: { asked, kept, removed: { reason: count } } -> the plain summary a builder reports
 *  ("12 of 15 words kept, 3 removed by the filter") and a flag for a partial or empty result. */
export function kept({ asked = 0, kept: k = 0, removed = {}, noun = 'items' } = {}) {
  const parts = Object.entries(removed).filter(([, n]) => n > 0).map(([why, n]) => `${n} ${why}`);
  const text = asked > k ? `${k} of ${asked} ${noun} kept${parts.length ? `, ${parts.join(', ')}` : `, ${asked - k} removed`}` : `${k} ${noun} kept`;
  return { asked, kept: k, removed, partial: k < asked && k > 0, nothing: k === 0 && asked > 0, text };
}
