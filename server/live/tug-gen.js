// Tug of Math's questions and computer opponent, read from the game itself (seed-games/tug-of-math.html, between the
// /* tug-gen:begin */ … /* tug-bot:end */ markers): one source of truth for the game, the unit tests and Oomba Live
// (the server makes each player's questions and checks the answers, so an answer never leaves the server before it is
// given). The block is plain ES5 with no DOM; it runs once in an empty node:vm context with a time limit.
//   const { TugGen, TugBot } = tug();
//   const deck = TugGen.deck(grade, seed); const q = deck.next(side);   // { e: tokens, a: answer, k: kind, g, n }
//   TugGen.check(q, v); TugGen.text(q, 'of'); TugGen.needsMinus(grade); TugGen.kindAt(grade, seed, n)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const GAME_FILE = path.join(ROOT, 'seed-games/tug-of-math.html');
const BEGIN = '/* tug-gen:begin */', END = '/* tug-bot:end */';

/** The source of the two pure blocks in a Tug of Math html (the generator, then the computer). */
export function source(html = fs.readFileSync(GAME_FILE, 'utf8')) {
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error('tug-of-math: the tug-gen/tug-bot markers are missing');
  return html.slice(a, b + END.length);
}
/** Runs the blocks: { TugGen, TugBot } (frozen copies of what the game itself uses). */
export function load(html) {
  const box = { window: {} };
  vm.runInNewContext(source(html), box, { timeout: 2000 });
  const { TugGen, TugBot } = box.window;
  if (!TugGen || !TugBot) throw new Error('tug-of-math: TugGen/TugBot not defined');
  return { TugGen: Object.freeze(TugGen), TugBot: Object.freeze(TugBot) };
}
let cached = null;
/** The game's generator and computer, read once. */
export function tug() { return cached || (cached = load()); }
