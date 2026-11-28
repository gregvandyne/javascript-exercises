// Assigning an official game that opens at a teacher's own problem or question set (services/game-sets.js SET_GAMES:
// Arithmetic Lab's activities, Algebra Builder's sets, a crossword...). One place for the Assign page
// (routes/game-folders.js /teach/assign and POST /api/teach/assign-game) and Oomba's chat (services/companion.js
// assign), so the chat assigns an activity exactly as the page does: the same lesson options, title and line under it.
import * as gameSets from './game-sets.js';
import * as TY from './typing.js';
import { cleanOptions, parseParams } from './play-params.js';

/** An official game that opens at a teacher's problem or question set. */
export const setGameOf = g => !!g && gameSets.SET_GAMES.has(g.slug) && g.source === 'seed';
/** An official set game whose Assign needs one of the teacher's own sets (not Word Hunt, Typing Zoo, Flashcards, which
 *  are played as they are too). */
export const needsSet = g => setGameOf(g) && !gameSets.OPEN_SET_GAMES.has(g.slug);
/** The lesson options for one of the teacher's sets: what the game's Save and assign sends (chapter=<set>&lock=1). */
export const setOptions = setId => `chapter=${setId}&lock=1`;
/** Where a teacher makes a set for this game: Arithmetic Lab opens at New activity; any other, the game itself. */
export const editorHref = g => (g.slug === 'arithmetic-lab' ? '/play/arithmetic-lab?mode=assign' : `/play/${g.slug}`);

/** The lesson options a set game's Assign carries (opts), and the lesson's name after them.
 *  -> { opts, what, label, title, name?, summary? } | null (not a set game, or played as it is) */
export function setAssign(t, g, raw) {
  if (!setGameOf(g)) return null;
  const opts = cleanOptions(String(raw || '')) || '';
  if (!opts && gameSets.OPEN_SET_GAMES.has(g.slug)) return null;   // Word Hunt with no set: the game as it is
  // Typing Zoo: only a teacher's own lesson (a set code) goes this way; its built-in lessons and tests are the picker's.
  if (g.slug === TY.SLUG && !gameSets.SET_ID.test(parseParams(opts).chapter || '')) return null;
  const what = gameSets.describe(g.id, parseParams(opts), g.slug);
  const label = what ? (what.kind === 'set' ? t('teach.assign.set', { count: what.n }) : what.label) : '';
  // A set with the teacher's own name (Arithmetic Lab): the lesson takes that name, and the label is its subtitle.
  if (what && what.title) return { opts, what, label, name: what.title, title: what.title, summary: label };
  return { opts, what, label, title: what ? `${g.title}: ${label}` : '' };
}
