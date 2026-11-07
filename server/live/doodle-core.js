// Doodle Hoot's rules and word list, read from the game itself (seed-games/doodle-hoot.html, between the
// /* doodle-core:begin */ … /* doodle-words:end */ markers): one source of truth for the game, the unit tests and
// Oomba Live (the server builds every tray and checks every guess, so the answer never leaves the server before a
// player has spelled it). The blocks are plain ES5 with no DOM; they run once in an empty node:vm context with a time
// limit. Nothing here is ever sent to an AI, a log or the database.
//   const { DoodleCore: C, DoodleWords: D } = doodle();
//   C.words(D, 'fr', 1); C.buildTray('chat', 'fr', 1, C.rng(seed), { bad }); C.check(tray, answer, picks, locks)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const GAME_FILE = path.join(ROOT, 'seed-games/doodle-hoot.html');
const BEGIN = '/* doodle-core:begin */', END = '/* doodle-words:end */';

/** The source of the two pure blocks in a Doodle Hoot html (the rules, then the words). */
export function source(html = fs.readFileSync(GAME_FILE, 'utf8')) {
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error('doodle-hoot: the doodle-core/doodle-words markers are missing');
  return html.slice(a, b + END.length);
}
/** Runs the blocks: { DoodleCore, DoodleWords } (frozen copies of what the game itself uses). */
export function load(html) {
  const box = { window: {} };
  vm.runInNewContext(source(html), box, { timeout: 2000 });
  const { DoodleCore, DoodleWords } = box.window;
  if (!DoodleCore || !DoodleWords) throw new Error('doodle-hoot: DoodleCore/DoodleWords not defined');
  return { DoodleCore: Object.freeze(DoodleCore), DoodleWords: Object.freeze(DoodleWords) };
}
let cached = null;
/** The game's rules and words, read once. */
export function doodle() { return cached || (cached = load()); }
